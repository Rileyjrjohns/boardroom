import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseDocumentId } from '@domain/value-objects/ids';
import type { DocumentId } from '@domain/value-objects/ids';
import { FRESHNESS } from '@application/shared/Loaded';
import type { OpenedDocument } from '@application/use-cases/documents/OpenDocument';

import { Badge } from '../components/Badge';
import { CONFIDENTIALITY_TONES } from '../components/badgeTones';
import { Button } from '../components/Button';
import { CaptureNotice } from '../components/CaptureNotice';
import { DemoOfflineSwitch } from '../components/DemoControls';
import { DocumentErrorState } from '../components/DocumentErrorState';
import { DocumentWatermark } from '../components/DocumentWatermark';
import { LiveText } from '../components/LiveText';
import { LoadingState } from '../components/LoadingState';
import { Message } from '../components/Message';
import { PdfViewer } from '../components/PdfViewer';
import { StatusBanner } from '../components/StatusBanner';
import { useFormatters } from '../format/FormattersProvider';
import { DOCUMENT_VIEW_STATUS, useDocumentView } from '../hooks/useDocumentView';
import { useScreenCaptureNotice } from '../hooks/useScreenCaptureNotice';
import { CONFIDENTIALITY_KEYS } from '../i18n/translationKeys';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, fontWeights, spacing } from '../theme/tokens';

interface DocumentScreenProps {
  /** The `documentId` segment of the route, as the router gives it. */
  readonly documentId: string | undefined;
}

/**
 * A document, in the viewer. The route parameter is a string from outside, so it is parsed first:
 * one that is no document id cannot be a document that exists, and is shown as not found.
 */
export function DocumentScreen({ documentId }: DocumentScreenProps) {
  const parsed = documentId === undefined ? undefined : parseDocumentId(documentId);

  if (parsed === undefined || !parsed.ok) return <NotFound />;
  return <DocumentViewer id={parsed.value} />;
}

function NotFound() {
  const { t } = useTranslation();

  return (
    <View style={styles.screen}>
      <Message centered message={t('document.notFound')} testID={TEST_IDS.documentNotFound} />
    </View>
  );
}

/**
 * Opens the document, shows it, and releases it when the screen is left (see `useDocumentView`),
 * and tells the reader about a capture of the screen while it is shown.
 */
function DocumentViewer({ id }: { readonly id: DocumentId }) {
  const { t } = useTranslation();
  const { state, retry } = useDocumentView(id);
  const { notice, dismiss } = useScreenCaptureNotice(id);

  return (
    <View style={styles.screen} testID={TEST_IDS.documentScreen}>
      <StatusBanner
        {...(state.status === DOCUMENT_VIEW_STATUS.Ready &&
        state.opened.source.freshness === FRESHNESS.Stale
          ? { staleSince: state.opened.source.cachedAt }
          : {})}
      />
      <DemoOfflineSwitch />
      {notice === undefined ? null : <CaptureNotice notice={notice} onDismiss={dismiss} />}
      {state.status === DOCUMENT_VIEW_STATUS.Loading ? (
        <LoadingState
          accessibilityLabel={t('document.loading')}
          testID={TEST_IDS.documentLoading}
        />
      ) : null}
      {state.status === DOCUMENT_VIEW_STATUS.Failed ? (
        <DocumentErrorState code={state.code} onRetry={retry} />
      ) : null}
      {state.status === DOCUMENT_VIEW_STATUS.Ready ? (
        <OpenedDocumentView key={state.opened.location} opened={state.opened} onRetry={retry} />
      ) : null}
    </View>
  );
}

/** Where the viewer stands in the file, once it has read it. */
type PdfState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly page: number; readonly pageCount: number }
  | { readonly status: 'failed' };

const PDF_LOADING: PdfState = { status: 'loading' };
const FIRST_PAGE = 1;

interface OpenedDocumentViewProps {
  readonly opened: OpenedDocument;
  /** Opens the document again, when the file could not be displayed. */
  readonly onRetry: () => void;
}

/**
 * An opened document: its title and what protects it, the file, the watermark over the file, and
 * where the reader is in it. Remounted for each file (the `key` is its location), so a document
 * that is opened again starts from the first page, loading.
 */
function OpenedDocumentView({ opened, onRetry }: OpenedDocumentViewProps) {
  const { t } = useTranslation();
  const { number } = useFormatters();
  const insets = useSafeAreaInsets();
  const [pdf, setPdf] = useState<PdfState>(PDF_LOADING);
  const { document, location, screenProtected, watermark } = opened;

  const loaded = useCallback((pageCount: number) => {
    setPdf({ status: 'ready', page: FIRST_PAGE, pageCount });
  }, []);
  const pageChanged = useCallback((page: number, pageCount: number) => {
    setPdf({ status: 'ready', page, pageCount });
  }, []);
  const failed = useCallback(() => {
    setPdf({ status: 'failed' });
  }, []);

  return (
    <View style={styles.document}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title} testID={TEST_IDS.documentTitle}>
          {document.title}
        </Text>
        <View style={styles.badges}>
          <Badge
            label={t(CONFIDENTIALITY_KEYS[document.confidentiality])}
            tone={CONFIDENTIALITY_TONES[document.confidentiality]}
          />
          {screenProtected ? (
            <View testID={TEST_IDS.documentProtectedBadge}>
              <Badge label={t('document.protectedBadge')} />
            </View>
          ) : null}
        </View>
      </View>

      {pdf.status === 'failed' ? (
        <View style={styles.failure} testID={TEST_IDS.documentPdfError}>
          <LiveText message={t('document.renderFailed')} style={styles.failureMessage} />
          <Button title={t('states.retry')} onPress={onRetry} testID={TEST_IDS.retryButton} />
        </View>
      ) : (
        <View style={styles.page}>
          <PdfViewer
            uri={location}
            onLoaded={loaded}
            onPageChanged={pageChanged}
            onFailed={failed}
          />
          {pdf.status === 'loading' ? (
            <View style={styles.loading}>
              <LoadingState
                accessibilityLabel={t('document.rendering')}
                testID={TEST_IDS.documentPdfLoading}
              />
            </View>
          ) : null}
          {screenProtected ? <DocumentWatermark watermark={watermark} /> : null}
        </View>
      )}

      {pdf.status === 'ready' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.indicator, { paddingBottom: insets.bottom + spacing.sm }]}
          testID={TEST_IDS.documentPageIndicator}
        >
          {t('document.pageIndicator', { page: number(pdf.page), total: number(pdf.pageCount) })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  document: {
    flex: 1,
  },
  header: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: fontSizes.subtitle,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  page: {
    flex: 1,
  },
  loading: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.documentBackdrop,
  },
  failure: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  failureMessage: {
    textAlign: 'center',
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  indicator: {
    paddingTop: spacing.sm,
    textAlign: 'center',
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
    backgroundColor: colors.surface,
  },
});
