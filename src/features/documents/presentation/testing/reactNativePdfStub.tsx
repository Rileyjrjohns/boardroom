import { useEffect } from 'react';
import { View } from 'react-native';

// Test support, not production code: what Jest gives the "ui" project when `PdfViewer` imports
// `react-native-pdf` (see `jest.config.js`). The real component draws with a native view that needs
// a phone. This one draws a view, records the properties it was last given, and lets a test report
// what the native view would: that the file was read, that the page changed, that it failed.

interface PdfStubProps {
  readonly source: { readonly uri?: string; readonly cache?: boolean };
  readonly onLoadComplete?: (pageCount: number) => void;
  readonly onPageChanged?: (page: number, pageCount: number) => void;
  readonly onError?: (error: Error) => void;
  readonly enableTextSelection?: boolean;
  readonly enableAnnotationRendering?: boolean;
  readonly fitPolicy?: number;
  readonly onPressLink?: (url: string) => void;
}

interface PdfStubState {
  /** The properties of the view as it was last rendered; `undefined` when none is on the screen. */
  latest: PdfStubProps | undefined;
  /** How many views were mounted, over the whole test. */
  mounted: number;
}

export const pdfStub: PdfStubState = { latest: undefined, mounted: 0 };

export function resetPdfStub(): void {
  pdfStub.latest = undefined;
  pdfStub.mounted = 0;
}

/** The properties of the view on the screen, or a failure of the test if there is none. */
export function pdfProps(): PdfStubProps {
  if (pdfStub.latest === undefined) throw new Error('No PDF view is on the screen.');
  return pdfStub.latest;
}

export default function Pdf(props: PdfStubProps) {
  // After each render, so that a test sees the properties the view has now.
  useEffect(() => {
    pdfStub.latest = props;
  });
  useEffect(() => {
    pdfStub.mounted += 1;
    return () => {
      pdfStub.latest = undefined;
    };
  }, []);
  return <View />;
}
