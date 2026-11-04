import { FilePreview, getFileType } from '@librechat/chat/components';
import { apiBaseUrl } from 'librechat-data-provider';
import type { ReferenceAsset } from 'librechat-data-provider';
import { toAbsoluteFilePath } from '~/utils';

export default function ReferenceImage({
  asset,
  className,
}: {
  asset: ReferenceAsset;
  className?: string;
}) {
  const imagePath = asset.file.preview ?? asset.file.filepath;
  if (!imagePath) {
    return (
      <FilePreview
        file={asset.file}
        fileType={getFileType(asset.file.type)}
        className={className}
      />
    );
  }

  return (
    <img
      src={toAbsoluteFilePath(imagePath, apiBaseUrl())}
      alt={asset.altText || asset.title}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}
