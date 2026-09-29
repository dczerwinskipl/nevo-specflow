import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DesignCaptureProvider } from '@nevo/figma-core/metadata';
import { Timeline } from './Timeline';

function ExampleTimeline() {
  return (
    <Timeline aria-label="Workflow history" size="md">
      <Timeline.Item>
        <Timeline.Marker tone="success" icon="check" />
        <Timeline.Content title="Implementation completed" time="11:18" />
      </Timeline.Item>
      <Timeline.Item aria-current="step">
        <Timeline.Marker tone="info" active />
        <Timeline.Content title="Review started" description="Review is running." />
      </Timeline.Item>
    </Timeline>
  );
}

describe('Timeline', () => {
  it('keeps chronological list semantics and allows aria-current on the active event', () => {
    const html = renderToStaticMarkup(<ExampleTimeline />);

    expect(html).toContain('<ol');
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('Implementation completed');
    expect(html).toContain('Review started');
  });

  it('keeps marker visuals out of the accessibility tree', () => {
    const html = renderToStaticMarkup(<ExampleTimeline />);

    expect(html).toContain('aria-hidden="true"');
  });

  it('uses a plain semantic dot by default instead of a bordered marker shell', () => {
    const html = renderToStaticMarkup(
      <Timeline size="sm">
        <Timeline.Item>
          <Timeline.Marker tone="success" />
          <Timeline.Content title="Done" />
        </Timeline.Item>
      </Timeline>,
    );

    expect(html).toMatch(
      /<span class="(?=[^"]*\bsize-1\.5\b)(?=[^"]*\brounded-full\b)(?=[^"]*\bbg-current\b)[^"]*"><\/span>/,
    );
    expect(html).not.toContain('rounded-full border');
  });

  it('renders explicit icons directly without adding a surrounding marker circle', () => {
    const html = renderToStaticMarkup(
      <Timeline>
        <Timeline.Item>
          <Timeline.Marker tone="attention" icon="triangle-alert" />
          <Timeline.Content title="Approval required" />
        </Timeline.Item>
      </Timeline>,
    );

    expect(html).not.toContain('border-status-attention');
    expect(html).not.toContain('bg-status-attention');
  });

  it('leaves visual breathing room between marker visuals and the connector', () => {
    const html = renderToStaticMarkup(
      <Timeline size="sm">
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="First" />
        </Timeline.Item>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Second" />
        </Timeline.Item>
      </Timeline>,
    );

    expect(html).toContain('bottom-1');
    expect(html).toContain('top-4');
  });

  it('keeps compact activity inline-first and uses meta as a second line only when description is present', () => {
    const singleLine = renderToStaticMarkup(
      <Timeline size="sm">
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Review" meta="Pending" />
        </Timeline.Item>
      </Timeline>,
    );
    const twoLines = renderToStaticMarkup(
      <Timeline size="sm">
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Implement" description="Editing 4 files" meta="In progress" />
        </Timeline.Item>
      </Timeline>,
    );

    expect(singleLine).toContain('Review');
    expect(singleLine).toContain('·');
    expect(singleLine).toContain('Pending');
    expect(singleLine).not.toContain('mt-0.5 min-w-0 truncate text-content-muted');

    expect(twoLines).toContain('Implement');
    expect(twoLines).toContain('Editing 4 files');
    expect(twoLines).toContain('In progress');
    expect(twoLines).toContain('mt-0.5 min-w-0 truncate text-content-muted');
  });

  it('keeps extractor identity and property metadata out of ordinary runtime markup', () => {
    const html = renderToStaticMarkup(
      <Timeline size="sm">
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Pending" />
        </Timeline.Item>
      </Timeline>,
    );

    expect(html).not.toContain('data-design-component');
    expect(html).not.toContain('data-design-prop-size');
  });

  it('emits deterministic design metadata only when capture is enabled', () => {
    const html = renderToStaticMarkup(
      <DesignCaptureProvider captureComponents={['Timeline']}>
        <Timeline size="sm">
          <Timeline.Item>
            <Timeline.Marker />
            <Timeline.Content title="Pending" />
          </Timeline.Item>
        </Timeline>
      </DesignCaptureProvider>,
    );

    expect(html).toContain('data-design-component="Timeline"');
    expect(html).toContain('data-design-prop-size="sm"');
    expect(html).toContain('data-design-capture="true"');
  });

  it('renders intentionally falsey ReactNode values instead of dropping them', () => {
    const html = renderToStaticMarkup(
      <Timeline>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Counters" description={0} meta={0} time={0}>
            {0}
          </Timeline.Content>
        </Timeline.Item>
      </Timeline>,
    );

    expect(html.match(/>0</g)).toHaveLength(4);
  });

  it('preserves numeric zero in compact inline and secondary content', () => {
    const html = renderToStaticMarkup(
      <Timeline size="sm">
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Counters" description={0} meta={0} />
        </Timeline.Item>
      </Timeline>,
    );

    expect(html.match(/>0</g)).toHaveLength(2);
  });

  it('treats React boolean placeholders as absent optional content', () => {
    const withBooleans = renderToStaticMarkup(
      <Timeline>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content
            title="Boolean placeholders"
            description={false}
            meta={false}
            time={false}
          >
            {false}
          </Timeline.Content>
        </Timeline.Item>
      </Timeline>,
    );
    const withoutOptionals = renderToStaticMarkup(
      <Timeline>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Boolean placeholders" />
        </Timeline.Item>
      </Timeline>,
    );

    expect(withBooleans).toBe(withoutOptionals);
  });

  it('does not reserve the timestamp grid column when no timestamp is rendered', () => {
    const withoutTime = renderToStaticMarkup(
      <Timeline>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="Without time" />
        </Timeline.Item>
      </Timeline>,
    );
    const withTime = renderToStaticMarkup(
      <Timeline>
        <Timeline.Item>
          <Timeline.Marker />
          <Timeline.Content title="With time" time="11:18" />
        </Timeline.Item>
      </Timeline>,
    );

    expect(withoutTime).not.toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(withTime).toContain('grid-cols-[minmax(0,1fr)_auto]');
  });

  it('fails fast when a compound part is rendered outside Timeline', () => {
    expect(() => renderToStaticMarkup(<Timeline.Item />)).toThrow(
      'Timeline.Item must be rendered inside Timeline.',
    );
    expect(() => renderToStaticMarkup(<Timeline.Marker />)).toThrow(
      'Timeline.Marker must be rendered inside Timeline.',
    );
    expect(() => renderToStaticMarkup(<Timeline.Content title="Orphan" />)).toThrow(
      'Timeline.Content must be rendered inside Timeline.',
    );
  });
});



