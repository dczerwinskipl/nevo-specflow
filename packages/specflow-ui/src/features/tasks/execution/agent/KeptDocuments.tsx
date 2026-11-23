import { Fragment } from 'react';
import { InlineAction } from '../InlineAction';

/**
 * The documents an agent attempt wrote, by file name: each a link that opens the document when it
 * can be opened from here (`openDocument` answers false for a path it does not know), else plain
 * text. The sentence around it belongs to the caller.
 */
export function KeptDocuments({
  paths,
  openDocument,
}: {
  readonly paths: readonly string[];
  readonly openDocument: ((path: string) => boolean) | undefined;
}) {
  return (
    <>
      {paths.map((path, index) => {
        const name = path.split('/').at(-1) ?? path;

        return (
          <Fragment key={path}>
            {index > 0 ? ', ' : null}
            {openDocument ? (
              <InlineAction onClick={() => openDocument(path)}>{name}</InlineAction>
            ) : (
              name
            )}
          </Fragment>
        );
      })}
    </>
  );
}
