const sharp = require('sharp');
const { sanitizeImage, inspectImageBuffer, importReferenceImage } = require('./imageImport');

const image = () =>
  sharp({
    create: { width: 4, height: 2, channels: 3, background: { r: 20, g: 40, b: 60 } },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();

describe('secure reference image import', () => {
  it('validates every redirect and strips image metadata while applying orientation', async () => {
    const source = await image();
    const validateURL = jest.fn().mockResolvedValue(undefined);
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://cdn.example/final.jpg' } }),
      )
      .mockResolvedValueOnce(
        new Response(source, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
      );

    const result = await sanitizeImage({
      url: 'https://source.example/image',
      maxBytes: 1024 * 1024,
      maxPixels: 100,
      timeoutMs: 1000,
      outputType: 'webp',
      fetch,
      validateURL,
    });
    const metadata = await sharp(result.buffer).metadata();

    expect(validateURL.mock.calls.map(([url]) => url)).toEqual([
      'https://source.example/image',
      'https://cdn.example/final.jpg',
    ]);
    expect(metadata).toMatchObject({ format: 'webp', width: 2, height: 4 });
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.exif).toBeUndefined();
    expect(result).toMatchObject({
      mimeType: 'image/webp',
      width: 2,
      height: 4,
      orientation: 'portrait',
    });
    expect(result.exactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.perceptualHash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('fingerprints an existing owned image without creating another file', async () => {
    const source = await image();
    const result = await inspectImageBuffer(source, 100);

    expect(result).toMatchObject({
      width: 4,
      height: 2,
      orientation: 'landscape',
      mimeType: 'image/jpeg',
      bytes: source.length,
    });
    expect(result.exactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.perceptualHash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('rejects the decoded stream once it exceeds the byte limit', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(Buffer.alloc(101), { status: 200, headers: { 'content-type': 'image/png' } }),
      );

    await expect(
      sanitizeImage({
        url: 'https://example.com/large.png',
        maxBytes: 100,
        maxPixels: 100,
        timeoutMs: 1000,
        outputType: 'webp',
        fetch,
        validateURL: jest.fn(),
      }),
    ).rejects.toThrow('Image exceeds the 100 byte limit');
  });

  it('does not write storage for an exact duplicate', async () => {
    const existing = { id: 'asset-existing', fileId: 'file-existing' };
    const deps = {
      sanitize: jest.fn().mockResolvedValue({ exactHash: 'same' }),
      findAssetByExactHash: jest.fn().mockResolvedValue(existing),
      saveBuffer: jest.fn(),
    };

    await expect(
      importReferenceImage(
        { ownerId: 'owner', token: { imageUrl: 'https://example.com/a' } },
        deps,
      ),
    ).resolves.toEqual({ asset: existing, reused: true });
    expect(deps.saveBuffer).not.toHaveBeenCalled();
  });

  it('removes stored bytes and file metadata when the asset write fails', async () => {
    const deps = {
      sanitize: jest.fn().mockResolvedValue({
        buffer: Buffer.from('sanitized'),
        exactHash: 'hash',
        perceptualHash: 'perceptual',
        width: 10,
        height: 5,
        orientation: 'landscape',
        mimeType: 'image/webp',
        bytes: 9,
      }),
      findAssetByExactHash: jest.fn().mockResolvedValue(null),
      saveBuffer: jest.fn().mockResolvedValue('/images/owner/reference.webp'),
      createFile: jest.fn().mockResolvedValue({ file_id: 'file-new' }),
      createAsset: jest.fn().mockRejectedValue(new Error('database down')),
      deleteStoredFile: jest.fn().mockResolvedValue(undefined),
      deleteFileRecord: jest.fn().mockResolvedValue(undefined),
      createId: () => 'new-id',
    };

    await expect(
      importReferenceImage(
        {
          ownerId: 'owner',
          token: {
            imageUrl: 'https://example.com/a',
            title: 'Reference',
            rightsState: 'known',
            provider: 'pexels',
            providerAssetId: '42',
            sourcePageUrl: 'https://pexels.com/42',
          },
        },
        deps,
      ),
    ).rejects.toThrow('database down');
    expect(deps.saveBuffer).toHaveBeenCalledWith(expect.objectContaining({ basePath: 'images' }));
    expect(deps.deleteStoredFile).toHaveBeenCalledWith({
      filepath: '/images/owner/reference.webp',
      ownerId: 'owner',
    });
    expect(deps.deleteFileRecord).toHaveBeenCalledWith('owner', 'file-new');
  });
});
