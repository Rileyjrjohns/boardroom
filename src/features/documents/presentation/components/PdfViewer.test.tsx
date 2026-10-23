import { render, screen } from '@testing-library/react-native';

import { pdfProps, pdfStub, resetPdfStub } from '../testing/reactNativePdfStub';

import { PdfViewer } from './PdfViewer';
import { DOCUMENTS_TEST_IDS } from '../testIds';

// The component that draws a PDF is the one file that imports `react-native-pdf`; Jest gives it the
// stub of `testing/reactNativePdfStub.tsx`. What is checked is the conversation with the view: the
// file it is given, what it is told to leave off, and the way it reports back.

const URI = 'file:///documents/report.pdf';

function renderViewer(handlers: Partial<Parameters<typeof PdfViewer>[0]> = {}) {
  const callbacks = {
    onLoaded: jest.fn(),
    onPageChanged: jest.fn(),
    onFailed: jest.fn(),
  };
  const props = { uri: URI, ...callbacks, ...handlers };
  const rendered = render(<PdfViewer {...props} />);
  return { ...rendered, callbacks, props };
}

beforeEach(() => {
  resetPdfStub();
});

describe('PdfViewer', () => {
  it('gives the view the file it was given, and never caches it', () => {
    renderViewer();

    expect(pdfProps().source).toEqual({ uri: URI, cache: false });
    expect(screen.getByTestId(DOCUMENTS_TEST_IDS.documentPdf)).toBeTruthy();
  });

  it('keeps the same source while the file is the same: another object would make the view load it again', () => {
    const { rerender, props } = renderViewer();
    const first = pdfProps().source;

    rerender(<PdfViewer {...props} onLoaded={jest.fn()} />);

    expect(pdfProps().source).toBe(first);
  });

  it('gives the view another source for another file', () => {
    const { rerender, props } = renderViewer();

    rerender(<PdfViewer {...props} uri="file:///documents/other.pdf" />);

    expect(pdfProps().source).toEqual({ uri: 'file:///documents/other.pdf', cache: false });
  });

  it('turns off what leads out of the document', () => {
    renderViewer();

    expect(pdfProps().enableAnnotationRendering).toBe(false);
    expect(pdfProps().onPressLink?.('https://example.com')).toBeUndefined();
  });

  it('does not set a text selection prop: the view ignores it, and setting it would claim a protection that is not there', () => {
    renderViewer();

    expect(pdfProps().enableTextSelection).toBeUndefined();
  });

  it('fits the width of the page', () => {
    renderViewer();

    expect(pdfProps().fitPolicy).toBe(0);
  });

  it('reports that the file was read, with its page count', () => {
    const { callbacks } = renderViewer();

    pdfProps().onLoadComplete?.(12);

    expect(callbacks.onLoaded).toHaveBeenCalledWith(12);
  });

  it('reports the page the reader is on', () => {
    const { callbacks } = renderViewer();

    pdfProps().onPageChanged?.(3, 12);

    expect(callbacks.onPageChanged).toHaveBeenCalledWith(3, 12);
  });

  it('reports that the file could not be read, and nothing of why', () => {
    const { callbacks } = renderViewer();

    pdfProps().onError?.(new Error('/private/var/mobile/report.pdf could not be opened'));

    expect(callbacks.onFailed).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(callbacks.onFailed.mock.calls)).not.toContain('private');
  });

  it('is on the screen once, and gone with the component', () => {
    const { unmount } = renderViewer();
    expect(pdfStub.mounted).toBe(1);

    unmount();

    expect(pdfStub.latest).toBeUndefined();
  });
});
