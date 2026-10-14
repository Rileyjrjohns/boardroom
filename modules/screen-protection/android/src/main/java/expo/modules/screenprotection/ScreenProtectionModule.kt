package expo.modules.screenprotection

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val SCREENSHOT_TAKEN = "onScreenshotTaken"
private const val CAPTURE_CHANGED = "onCaptureChanged"

/**
 * Screen protection for Android.
 *
 * - **Protection.** While it is on, `FLAG_SECURE` is set on the window of the current activity: the
 *   system blocks screenshots and screen recordings of that window and shows a blank thumbnail in
 *   the recent apps. The flag belongs to a window, so the module sets it again whenever an activity
 *   enters the foreground (the activity was recreated by a configuration change, or the app comes
 *   back), and when there is no activity yet it only remembers that protection is on. Windows other
 *   than the one of the activity (a React Native `Modal`, a dialog) are not covered by it.
 * - **Screenshots** are reported on Android 14 and later (`ScreenshotDetector`); before that the
 *   system tells apps nothing.
 * - **Recording** is reported on Android 15 and later (`RecordingDetector`); before that, nothing.
 *
 * Threading: all state is read and written on the main thread, and every entry point hops there.
 * The detectors are bound to the activity that is current: they follow it when it changes.
 */
class ScreenProtectionModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())

  private var protectionEnabled = false
  private var observingScreenshots = false
  private var observingCapture = false
  private var lastCaptured: Boolean? = null
  private var screenshots: ScreenshotDetector? = null
  private var recordings: RecordingDetector? = null

  override fun definition() = ModuleDefinition {
    Name("ScreenProtection")

    Events(SCREENSHOT_TAKEN, CAPTURE_CHANGED)

    // Turns the protection on or off. Idempotent. Resolves once the flag has been set or cleared.
    AsyncFunction("setProtectionEnabled") { enabled: Boolean ->
      protectionEnabled = enabled
      applyProtection()
    }.runOnQueue(Queues.MAIN)

    // Whether the screen is being recorded right now (Android 15 and later; false before).
    AsyncFunction("isCaptured") {
      currentlyCaptured()
    }.runOnQueue(Queues.MAIN)

    // The listeners of the system are added when JavaScript starts listening to an event, and
    // removed when it stops, so that nothing runs for nobody.
    OnStartObserving(SCREENSHOT_TAKEN) {
      onMain {
        observingScreenshots = true
        attachScreenshots()
      }
    }
    OnStopObserving(SCREENSHOT_TAKEN) {
      onMain {
        observingScreenshots = false
        detachScreenshots()
      }
    }
    OnStartObserving(CAPTURE_CHANGED) {
      onMain {
        observingCapture = true
        attachRecording()
      }
    }
    OnStopObserving(CAPTURE_CHANGED) {
      onMain {
        observingCapture = false
        detachRecording()
        lastCaptured = null
      }
    }

    // The activity is the owner of the flag and of the callbacks: follow it.
    OnActivityEntersForeground {
      onMain {
        applyProtection()
        attachScreenshots()
        attachRecording()
      }
    }
    OnActivityEntersBackground {
      onMain {
        detachScreenshots()
        detachRecording()
      }
    }
    OnActivityDestroys {
      onMain {
        detachScreenshots()
        detachRecording()
      }
    }

    OnDestroy {
      onMain {
        observingScreenshots = false
        observingCapture = false
        detachScreenshots()
        detachRecording()
        // The activity outlives the module when React Native reloads: leave its window as found.
        protectionEnabled = false
        applyProtection()
      }
    }
  }

  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post { block() }
  }

  // Protection

  /** Sets or clears the flag on the current window. Without an activity, it waits for one. */
  private fun applyProtection() {
    val window = appContext.currentActivity?.window ?: return
    if (protectionEnabled) {
      window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    } else {
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
  }

  // Screenshots (Android 14 and later)

  private fun attachScreenshots() {
    if (!observingScreenshots || Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
    val activity = appContext.currentActivity ?: return
    val detector = screenshots ?: ScreenshotDetector {
      sendEvent(SCREENSHOT_TAKEN, mapOf<String, Any?>())
    }.also { screenshots = it }
    detector.attach(activity)
  }

  private fun detachScreenshots() {
    screenshots?.detach()
  }

  // Recording (Android 15 and later)

  private fun attachRecording() {
    if (!observingCapture || Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return
    val activity = appContext.currentActivity ?: return
    val detector = recordings ?: RecordingDetector { captured -> reportCapture(captured) }
      .also { recordings = it }
    // The callback reports changes only, so the state at the start is read here. When the detector
    // is attached again (the activity came back, or was recreated), a change that happened while it
    // was off is reported now.
    val before = lastCaptured
    val now = detector.attach(activity)
    lastCaptured = now
    if (before != null && before != now) {
      sendEvent(CAPTURE_CHANGED, mapOf("captured" to now))
    }
  }

  private fun detachRecording() {
    recordings?.detach()
  }

  private fun reportCapture(captured: Boolean) {
    onMain {
      if (captured == lastCaptured) return@onMain
      lastCaptured = captured
      sendEvent(CAPTURE_CHANGED, mapOf("captured" to captured))
    }
  }

  private fun currentlyCaptured(): Boolean {
    if (observingCapture) lastCaptured?.let { return it }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return false
    val activity = appContext.currentActivity ?: return false
    return RecordingDetector.peek(activity)
  }
}
