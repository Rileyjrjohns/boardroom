import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FRESHNESS } from '@core/application/offline/Loaded';
import { parseDocumentId } from '@core/domain/value-objects/ids';
import type { DocumentId } from '@core/domain/value-objects/ids';
import { Badge } from '@core/presentation/components/Badge';
import { Button } from '@core/presentation/components/Button';
import { DemoOfflineSwitch } from '@core/presentation/components/DemoControls';
import { LiveText } from '@core/presentation/components/LiveText';
import { LoadingState } from '@core/presentation/components/LoadingState';
import { StatusBanner } from '@core/presentation/components/StatusBanner';
import { useFormatters } from '@core/presentation/format/FormattersProvider';
import { useUiStore } from '@core/presentation/state/uiStore';
import { colors, fontSizes, fontWeights, spacing } from '@core/presentation/theme/tokens';
import type { OpenedDocument } from '@features/documents/application/use-cases/OpenDocument';
import { CONFIDENTIALITY_TONES } from '@features/meetings/presentation/components/badgeTones';

import { CaptureNotice } from '../components/CaptureNotice';
import { DocumentErrorState } from '../components/DocumentErrorState';
import { DocumentWatermark } from '../components/DocumentWatermark';
import { PdfViewer } from '../components/PdfViewer';
import { SecureContent } from '../components/SecureContent';
import { DOCUMENT_VIEW_STATUS, useDocumentView } from '../hooks/useDocumentView';
import { useScreenCaptureNotice } from '../hooks/useScreenCaptureNotice';
import { DOCUMENTS_TEST_IDS } from '../testIds';
import { CONFIDENTIALITY_KEYS } from '@features/meetings/presentation/i18n/meetingMessageKeys';
import { CORE_TEST_IDS } from '@core/presentation/testIds';

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
      <View style={styles.notFound}>
        <Text style={styles.notFoundMessage} testID={DOCUMENTS_TEST_IDS.documentNotFound}>
          {t('document.notFound')}
        </Text>
      </View>
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
    <View style={styles.screen} collapsable={false} testID={DOCUMENTS_TEST_IDS.documentScreen}>
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
          testID={DOCUMENTS_TEST_IDS.documentLoading}
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
 * An opened document: its title and what protects it, and below them the pages. Remounted for each
 * file (the `key` is its location), so a document that is opened again starts from the first page,
 * loading.
 *
 * **The PDF view is mounted only while the app is active.** The privacy cover is up from the
 * moment the app goes inactive or to the background, and stays up on the way back until the lock
 * has been judged (see `useAppLifecycle`), so it is the signal: while it is up the native view is
 * unmounted, and it is mounted again, from the first page, when the cover is lifted. On Android the
 * native view renders pages again when the app resumes, and when the lock removes the screen at the
 * same moment it renders on a document that is already closed, which kills the app. A locked app
 * removes this screen, so nothing mounts again for it.
 */
function OpenedDocumentView({ opened, onRetry }: OpenedDocumentViewProps) {
  const { t } = useTranslation();
  const covered = useUiStore((state) => state.privacyCover);
  const { document, screenProtected } = opened;

  return (
    <View style={styles.document}>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          style={styles.title}
          testID={DOCUMENTS_TEST_IDS.documentTitle}
        >
          {document.title}
        </Text>
        <View style={styles.badges}>
          <Badge
            label={t(CONFIDENTIALITY_KEYS[document.confidentiality])}
            tone={CONFIDENTIALITY_TONES[document.confidentiality]}
          />
          {screenProtected ? (
            <Badge
              label={t('document.protectedBadge')}
              testID={DOCUMENTS_TEST_IDS.documentProtectedBadge}
            />
          ) : null}
        </View>
      </View>

      {covered ? <View style={styles.page} /> : <DocumentPages opened={opened} onRetry={onRetry} />}
    </View>
  );
}

/**
 * The pages of an opened document: the file in the PDF view, the watermark of the reader over it,
 * and where the reader is in the file. It holds the state of the view, so it starts again, loading,
 * each time the view is mounted.
 *
 * **Every document carries the watermark**, protected or not: the screen protection and the badge
 * are decided by the classification of the document (see `OpenDocument`), but the name of the
 * reader on a page deters a photograph of any document.
 *
 * **The pages and the watermark are in the secure container of a protected document**
 * (`SecureContent`): on iOS they are left out of screenshots. The title, the badge and the page
 * indicator are not, they are outside it. The loading veil is inside, so it does not matter which
 * of the two a capture catches.
 */
function DocumentPages({ opened, onRetry }: OpenedDocumentViewProps) {
  const { t } = useTranslation();
  const { number } = useFormatters();
  const insets = useSafeAreaInsets();
  const [pdf, setPdf] = useState<PdfState>(PDF_LOADING);
  const { location, watermark, screenProtected } = opened;

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
    <>
      {pdf.status === 'failed' ? (
        <View style={styles.failure}>
          <LiveText
            message={t('document.renderFailed')}
            style={styles.failureMessage}
            testID={DOCUMENTS_TEST_IDS.documentPdfError}
          />
          <Button title={t('states.retry')} onPress={onRetry} testID={CORE_TEST_IDS.retryButton} />
        </View>
      ) : (
        <View style={styles.page}>
          <SecureContent secure={screenProtected}>
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
                  testID={DOCUMENTS_TEST_IDS.documentPdfLoading}
                />
              </View>
            ) : null}
            <DocumentWatermark watermark={watermark} />
          </SecureContent>
        </View>
      )}

      {pdf.status === 'ready' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.indicator, { paddingBottom: insets.bottom + spacing.sm }]}
          testID={DOCUMENTS_TEST_IDS.documentPageIndicator}
        >
          {t('document.pageIndicator', { page: number(pdf.page), total: number(pdf.pageCount) })}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  notFoundMessage: {
    textAlign: 'center',
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
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
