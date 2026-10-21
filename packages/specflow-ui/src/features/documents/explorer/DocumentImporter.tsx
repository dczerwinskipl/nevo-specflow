import { useImperativeHandle, useRef, type Ref } from 'react';

export interface DocumentImporterHandle {
  /** Opens the system file picker; the chosen files go into `folder`. */
  choose: (folder: string) => void;
}

/**
 * The hidden file input behind every "Import" action. It only collects the selection; checking
 * the files against the limits is `planImport`, sending them is the operations hook.
 */
export function DocumentImporter({
  formats,
  handleRef,
  onFiles,
}: {
  /** Accepted extensions without the dot. */
  formats: readonly string[];
  handleRef: Ref<DocumentImporterHandle>;
  /** Resolves when the import finished; the picker is reset afterwards so the same file can be chosen again. */
  onFiles: (files: File[], folder: string) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  // The folder of the picker that is open: the browser reports the files in a later event.
  const folder = useRef('');
  useImperativeHandle(handleRef, () => ({
    choose: (target) => {
      folder.current = target;
      input.current?.click();
    },
  }));
  return (
    <input
      hidden
      ref={input}
      type="file"
      multiple
      accept={formats.map((extension) => '.' + extension).join(',')}
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        void onFiles(files, folder.current).finally(() => {
          if (input.current) input.current.value = '';
        });
      }}
    />
  );
}
