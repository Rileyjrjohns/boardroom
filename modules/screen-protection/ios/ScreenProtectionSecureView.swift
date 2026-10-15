import ExpoModulesCore
import os
import UIKit

private let secureViewLog = Logger(
  subsystem: "com.boardroom.screenprotection", category: "SecureView")

/// The private `CALayer` property that the system sets on the layer of a secure text field, and the
/// value it sets: the layer is left out of screenshots, screen recordings and mirroring.
private enum CaptureExclusion {
  static let key = "disableUpdateMask"
  static let setter = NSSelectorFromString("setDisableUpdateMask:")
  /// The two bits set for a secure text field.
  static let hiddenFromCapture = (1 << 1) | (1 << 4)
  static let visible = 0
}

/// A view whose content is left out of screenshots, screen recordings and mirroring while `secure` is
/// on, and is drawn and touched as usual on the screen.
///
/// **The technique.** iOS has no public API that keeps an arbitrary view out of captures. A
/// `UITextField` with `isSecureTextEntry = true` is left out of them because UIKit sets the private
/// `disableUpdateMask` property on the layer that draws it. This view sets the same property on its
/// own layer, so its whole subtree (here the PDF and its watermark) is left out. An earlier attempt
/// that hosted the content inside the internal canvas of a secure text field showed the content in
/// captures on iOS 27: it is the flag that matters, not the text field.
///
/// **It is undocumented behaviour.** The property is private to Core Animation. It is set through
/// key-value coding only when the layer answers to its setter, so an iOS version without it gives a
/// plain view and never a crash; that case is reported (an `onSecureLayerFallback` event and a line
/// in the log of the system under the subsystem `com.boardroom.screenprotection`).
///
/// **Children** are mounted by React the ordinary way: nothing is moved, so layout, safe areas and
/// touches are unchanged.
public final class ScreenProtectionSecureView: ExpoView {
  /// Fired when `secure` is on and the layer cannot be left out of captures.
  let onSecureLayerFallback = EventDispatcher()

  /// Whether the content should be left out of captures. Set by the `secure` prop.
  var secure = false {
    didSet {
      if secure != oldValue {
        applyMode()
      }
    }
  }

  private var reportedFallback = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      applyMode()
    }
  }

  private func applyMode() {
    guard layer.responds(to: CaptureExclusion.setter) else {
      if secure {
        reportFallback(reason: "the layer has no \(CaptureExclusion.key) property")
      }
      return
    }
    let mask = secure ? CaptureExclusion.hiddenFromCapture : CaptureExclusion.visible
    layer.setValue(mask, forKey: CaptureExclusion.key)
    if secure {
      secureViewLog.info("layer left out of captures")
    }
  }

  private func reportFallback(reason: String) {
    guard window != nil, !reportedFallback else { return }
    reportedFallback = true
    secureViewLog.error(
      "secure layer unavailable, content shown in a plain view: \(reason, privacy: .public)")
    onSecureLayerFallback(["reason": reason])
  }
}
