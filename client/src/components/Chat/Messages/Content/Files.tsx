import { useMemo, useState, useCallback, memo } from 'react';
import { BookmarkPlus, Check } from 'lucide-react';
import { FileContainer } from '@librechat/chat/components';
import type { TFile, TMessage } from 'librechat-data-provider';
import { useMessagePartsHost } from '~/Providers/MessagePartsHostContext';
import { usesImagePreview, hydrateFileDeliveryMetadata } from '~/utils';
import { useReferenceLibraryCapabilities, useSaveReferenceImage } from '~/data-provider';
import { useLocalize } from '~/hooks';
import FilePreviewDialog from './FilePreviewDialog';
import { useShareContext } from '~/Providers';
import Image from './Image';

const Files = ({ message }: { message?: TMessage }) => {
  const localize = useLocalize();
  const { shareId } = useShareContext();
  const messagePartsHost = useMessagePartsHost();
  const fileMap = messagePartsHost.useFileMap();
  const showToast = messagePartsHost.useToast();
  const { data: referenceLibrary } = useReferenceLibraryCapabilities({
    enabled: !shareId,
  });
  const saveReference = useSaveReferenceImage();
  const [savedFileIds, setSavedFileIds] = useState<Set<string>>(new Set());
  const files = useMemo(
    () => hydrateFileDeliveryMetadata(message?.files, undefined, shareId ? undefined : fileMap),
    [message?.files, fileMap, shareId],
  );
  const imageFiles = useMemo(() => {
    return files?.filter(usesImagePreview) || [];
  }, [files]);

  const otherFiles = useMemo(() => {
    return files?.filter((file) => !usesImagePreview(file)) || [];
  }, [files]);

  const [selectedFile, setSelectedFile] = useState<Partial<TFile> | null>(null);

  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      setSelectedFile(null);
    }
  }, []);

  return (
    <>
      {otherFiles.length > 0 &&
        otherFiles.map((file) => (
          <FileContainer
            key={file.file_id}
            file={file as TFile}
            buttonClassName="border-surface-user-message max-w-full bg-transparent"
            containerClassName="max-w-full"
            onClick={() => setSelectedFile(file)}
          />
        ))}
      {imageFiles.length > 0 &&
        imageFiles.map((file) => {
          const fileId = file.file_id;
          const saved = fileId ? savedFileIds.has(fileId) : false;
          return (
            <div key={file.file_id} className="group/image relative ms-auto w-fit max-w-full">
              <Image
                alignRight
                className="border-surface-user-message mt-0 shadow-none"
                imagePath={file.preview ?? file.filepath ?? ''}
                height={file.height ?? 1920}
                width={file.width ?? 1080}
                altText={file.filename ?? 'Uploaded Image'}
              />
              {!shareId &&
                referenceLibrary?.enabled &&
                fileId &&
                !file.metadata?.referenceLibrary && (
                  <button
                    type="button"
                    disabled={saved || saveReference.isLoading}
                    onClick={() =>
                      saveReference.mutate(
                        { fileId, title: file.filename },
                        {
                          onSuccess: ({ reused }) => {
                            setSavedFileIds((current) => new Set(current).add(fileId));
                            showToast({
                              status: reused ? 'info' : 'success',
                              message: localize(
                                reused
                                  ? 'com_reference_library_save_reused'
                                  : 'com_reference_library_save_success',
                              ),
                            });
                          },
                          onError: () =>
                            showToast({
                              status: 'error',
                              message: localize('com_reference_library_save_error'),
                            }),
                        },
                      )
                    }
                    className="absolute top-2 right-2 flex items-center gap-1.5 rounded-lg border border-white/30 bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white opacity-100 shadow-sm backdrop-blur transition hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white disabled:cursor-default"
                  >
                    {saved ? <Check className="size-3.5" /> : <BookmarkPlus className="size-3.5" />}
                    {saved
                      ? localize('com_reference_library_saved')
                      : localize('com_reference_library_save')}
                  </button>
                )}
            </div>
          );
        })}
      <FilePreviewDialog
        open={selectedFile !== null}
        onOpenChange={handleClose}
        fileName={selectedFile?.filename ?? ''}
        fileId={selectedFile?.file_id}
        filePath={selectedFile?.filepath}
        fileType={selectedFile?.type ?? undefined}
        fileSource={selectedFile?.source}
        fileSize={(selectedFile as TFile)?.bytes}
        deliveryPath={selectedFile?.llmDeliveryPath}
      />
    </>
  );
};

export default memo(Files);
