import Pdf from 'react-native-pdf';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { TEST_IDS } from '../testIds';
import { colors } from '../theme/tokens';

interface PdfViewerProps {
  /** Where the file is: the location `OpenDocument` gave, a file of the device. */
  readonly uri: string;
  /** The file was read: how many pages it has. */
  readonly onLoaded: (pageCount: number) => void;
  /** The page on display changed (the first one, once the file is read, included). */
  readonly onPageChanged: (page: number, pageCount: number) => void;
  /** The file could not be read or drawn. */
  readonly onFailed: () => void;
}

/** The native view draws its own progress while it reads; the screen draws its own instead. */
const renderNoProgress = () => <View />;

/** A link in a document goes nowhere: a confidential document is not a way out of the app. */
const ignoreLink = (): void => undefined;

/**
 * Draws a PDF from a file of the device, with the native view of `react-native-pdf`. The one file
 * that imports the package (a lint rule keeps it so), and as small as it can be: it renames what
 * the view reports and sets what a confidential document needs off (text selection, which copies
 * what is on a page, annotations and links). Jest replaces the package with a stub that tests drive
 * (`testing/reactNativePdfStub.tsx`), so what is left unchecked here is the native view itself.
 */
export function PdfViewer({ uri, onLoaded, onPageChanged, onFailed }: PdfViewerProps) {
  // The view reloads when it is given another source object, so the object is made once per file.
  const source = useMemo(() => ({ uri, cache: false }), [uri]);

  return (
    <View style={styles.container} testID={TEST_IDS.documentPdf}>
      <Pdf
        source={source}
        style={styles.pdf}
        fitPolicy={0}
        enableAnnotationRendering={false}
        enableTextSelection={false}
        renderActivityIndicator={renderNoProgress}
        onLoadComplete={onLoaded}
        onPageChanged={onPageChanged}
        onError={onFailed}
        onPressLink={ignoreLink}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.documentBackdrop,
  },
  pdf: {
    flex: 1,
    backgroundColor: colors.documentBackdrop,
  },
});
