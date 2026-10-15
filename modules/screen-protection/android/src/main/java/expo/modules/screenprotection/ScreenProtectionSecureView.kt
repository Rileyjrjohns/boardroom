package expo.modules.screenprotection

import android.content.Context
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * The Android side of the secure view: a plain container.
 *
 * `FLAG_SECURE` (set by [ScreenProtectionModule] while protection is on) already makes the system
 * leave the whole window out of screenshots and screen recordings, so there is nothing more to do
 * here, and the `secure` prop only has to be accepted. React Native places each child itself
 * (`layout` is called on it), so this container must not lay them out again: [onLayout] does nothing.
 */
class ScreenProtectionSecureView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext) {
  /** Whether the content should be kept out of captures. Not used: the window flag covers it. */
  var secure: Boolean = false

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit
}
