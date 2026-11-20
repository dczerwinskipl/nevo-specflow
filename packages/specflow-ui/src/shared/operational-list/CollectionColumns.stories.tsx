import type { Meta, StoryObj } from '@storybook/react-vite';
import { InformationList, Typography, cn } from '@nevo/ui';
import { OperationalGroupHeader } from './OperationalGroupHeader';
import {
  CollectionColumns,
  CollectionRow,
  CollectionSupportingLine,
  collectionContainer,
  type CollectionTracks,
} from './CollectionColumns';

/*
 * The shared collection tracks with neutral content: the column header, rows and the stacked form
 * below 48rem of collection width. Product rows (SpecListRow, the Task row) bring their own cells.
 */

const rows = [
  {
    title: 'Deterministic admission and execution boundaries',
    facts: 'oidc-callback · Implementation',
    status: 'In progress',
  },
  {
    title: 'Ekran logowania z przyciskiem SSO i komunikatami błędów',
    facts: 'login-screen · Implementation',
    status: 'On hold',
    supporting:
      'Waiting for the identity provider to confirm the redirect URIs before the screen is built',
  },
];

function Collection({
  tracks,
  width,
  header = true,
}: {
  readonly tracks: Extract<CollectionTracks, 'task' | 'specification'>;
  readonly width: number;
  readonly header?: boolean;
}) {
  const labels =
    tracks === 'task' ? ['Task', 'Status'] : ['Specification', 'Situation', 'Progress'];

  return (
    <div style={{ width }} className={cn(collectionContainer, 'grid min-w-0 gap-5')}>
      {header ? <CollectionColumns tracks={tracks} labels={labels} /> : null}
      <section className="grid min-w-0 gap-2" aria-label="Group">
        <OperationalGroupHeader
          headingTag="h3"
          label="Group"
          count={rows.length}
          tone="info"
          expanded
          onToggle={() => undefined}
        />
        <InformationList>
          {rows.map((row) => (
            <InformationList.Item key={row.title} className="py-3" data-collection-row>
              <InformationList.Content>
                <CollectionRow tracks={tracks}>
                  <div className="min-w-0" data-collection-title>
                    <Typography as="h4" variant="title-sm" className="text-content-primary">
                      {row.title}
                    </Typography>
                    <Typography
                      as="div"
                      variant="body-sm"
                      className="mt-1 text-content-secondary [overflow-wrap:anywhere]"
                    >
                      {row.facts}
                    </Typography>
                  </div>
                  <div className="grid min-w-0 content-start gap-1" data-collection-status>
                    <Typography as="div" variant="body-sm">
                      {row.status}
                    </Typography>
                    {row.supporting ? (
                      <CollectionSupportingLine>{row.supporting}</CollectionSupportingLine>
                    ) : null}
                  </div>
                  {tracks === 'specification' ? (
                    <Typography as="div" variant="body-sm" className="text-content-secondary">
                      3 / 7 Tasks
                    </Typography>
                  ) : null}
                </CollectionRow>
              </InformationList.Content>
            </InformationList.Item>
          ))}
        </InformationList>
      </section>
    </div>
  );
}

const meta = {
  title: 'SpecFlow/Components/Collection Columns',
  component: Collection,
  parameters: { layout: 'padded' },
  args: { tracks: 'task', width: 1000 },
} satisfies Meta<typeof Collection>;
export default meta;
type Story = StoryObj<typeof meta>;

const columnsContract =
  (expectColumns: boolean): NonNullable<Story['play']> =>
  ({ canvasElement }) => {
    const header = canvasElement.querySelector<HTMLElement>('[data-collection-columns]');
    const headerShown = Boolean(header && header.getBoundingClientRect().height > 0);
    if (headerShown !== expectColumns) {
      throw new Error(`The column header must ${expectColumns ? '' : 'not '}show`);
    }

    for (const row of canvasElement.querySelectorAll('[data-collection-row]')) {
      const title = row.querySelector('[data-collection-title]')!.getBoundingClientRect();
      const status = row.querySelector('[data-collection-status]')!.getBoundingClientRect();
      const sideBySide = status.left >= title.right;
      if (sideBySide !== expectColumns) {
        throw new Error(
          `The status must ${expectColumns ? 'sit beside' : 'stack under'} the title`,
        );
      }

      if (expectColumns && header) {
        const headerCells = header.children;
        if (Math.abs(headerCells[1]!.getBoundingClientRect().left - status.left) > 1) {
          throw new Error('The header labels must line up with their tracks');
        }
      }
    }
  };

export const TaskWide: Story = { tags: ['contract'], play: columnsContract(true) };
export const TaskStacked: Story = {
  tags: ['contract'],
  args: { width: 360 },
  play: columnsContract(false),
};
/** Overview Task rows: the same tracks without a column header. */
export const TaskWithoutHeader: Story = { args: { header: false } };
export const SpecificationWide: Story = {
  tags: ['contract'],
  args: { tracks: 'specification' },
  play: columnsContract(true),
};
