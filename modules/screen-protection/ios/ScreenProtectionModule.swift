import ExpoModulesCore
import PDFKit
import UIKit

private let screenshotTakenEvent = "onScreenshotTaken"
private let captureChangedEvent = "onCaptureChanged"
/// An event of the secure view, not of the module (the view declares it).
private let secureLayerFallbackEvent = "onSecureLayerFallback"

/// How often, and for how long after a text selection, the edit menus of a PDF view are dismissed.
private let editMenuSweepInterval: TimeInterval = 0.1
private let editMenuSweepDuration: TimeInterval = 10

/// Screen protection for iOS.
///
/// iOS has no public API that blocks screenshots or screen recordings. What this module does
/// instead, while protection is on:
///
/// - **App switcher.** When a scene resigns active (app switcher, control centre, notification
///   centre, a system prompt) a neutral view is put over each of its windows, and taken away when
///   the scene becomes active again. The snapshot the system takes for the app switcher shows the
///   view, not the content. The scene notifications are used, because the app is scene based.
/// - **Text selection in a PDF.** The viewer of the app draws documents with a standard PDFKit
///   `PDFView`, which lets a reader select text and copy it (the property that would turn this off
///   in the viewer's package never reaches the native view). Any selection that a `PDFView` reports
///   is cleared as soon as it appears, and the edit menu (Copy, Select All, Look Up) that the
///   long-press brings is dismissed as it shows up. It relies on
///   `PDFViewSelectionChangedNotification`: a viewer that is not built on `PDFView` would need its
///   own handling.
/// - **Screenshots.** Reported (`onScreenshotTaken`), not blocked.
/// - **Recording, mirroring, AirPlay.** Reported (`onCaptureChanged`) from the capture state of the
///   scenes on iOS 17 and later (`UITraitCollection.sceneCaptureState`), and from `UIScreen` before.
///
/// The cover is on only while protection is on. Which screens need protection is the business of
/// the application layer, not of this module (see the README): the module does what it is told.
///
/// Threading: all state is read and written on the main queue, and every entry point hops there.
public final class ScreenProtectionModule: Module {
  private var protectionEnabled = false
  private var sceneObservers: [NSObjectProtocol] = []
  private var selectionObserver: NSObjectProtocol?
  private var editMenuSweep: Timer?

  private var screenshotObserver: NSObjectProtocol?

  private var captureObservers: [NSObjectProtocol] = []
  /// Opaque registrations of the trait observers (`UITraitChangeRegistration`, iOS 17).
  private var traitRegistrations: [(scene: UIWindowScene, registration: Any)] = []
  private var lastCaptured: Bool?
  private var observingCapture = false

  public func definition() -> ModuleDefinition {
    Name("ScreenProtection")

    Events(screenshotTakenEvent, captureChangedEvent)

    // Turns the cover on or off. Idempotent. Resolves once the change has been made.
    AsyncFunction("setProtectionEnabled") { [weak self] (enabled: Bool) in
      self?.setProtection(enabled)
    }.runOnQueue(.main)

    // Whether the screen is being recorded, mirrored or AirPlayed right now.
    AsyncFunction("isCaptured") { [weak self] () -> Bool in
      return self?.isCurrentlyCaptured() ?? false
    }.runOnQueue(.main)

    // The listeners of the system are added when JavaScript starts listening to an event, and
    // removed when it stops, so that nothing runs for nobody.
    OnStartObserving(screenshotTakenEvent) { [weak self] in
      DispatchQueue.main.async { self?.startObservingScreenshots() }
    }
    OnStopObserving(screenshotTakenEvent) { [weak self] in
      DispatchQueue.main.async { self?.stopObservingScreenshots() }
    }
    OnStartObserving(captureChangedEvent) { [weak self] in
      DispatchQueue.main.async { self?.startObservingCapture() }
    }
    OnStopObserving(captureChangedEvent) { [weak self] in
      DispatchQueue.main.async { self?.stopObservingCapture() }
    }

    OnDestroy { [weak self] in
      DispatchQueue.main.async { self?.tearDown() }
    }

    // A view whose layer is left out of captures through the private flag that UIKit sets for a
    // secure text field (see ScreenProtectionSecureView.swift). The event reports that the layer has
    // no such flag and the children are in a plain view.
    View(ScreenProtectionSecureView.self) {
      Events(secureLayerFallbackEvent)

      Prop("secure") { (view: ScreenProtectionSecureView, secure: Bool) in
        view.secure = secure
      }
    }
  }

  // MARK: - Protection (the cover)

  private func setProtection(_ enabled: Bool) {
    protectionEnabled = enabled
    if enabled {
      startObservingSelections()
      startObservingScenes()
      // Protection can be turned on while the app is already inactive (a system prompt is up).
      for scene in windowScenes() where scene.activationState == .foregroundInactive {
        cover(scene)
      }
    } else {
      stopObservingSelections()
      stopObservingScenes()
      for scene in windowScenes() {
        uncover(scene)
      }
    }
  }

  private func startObservingScenes() {
    guard sceneObservers.isEmpty else { return }
    let center = NotificationCenter.default
    sceneObservers = [
      center.addObserver(forName: UIScene.willDeactivateNotification, object: nil, queue: .main) {
        [weak self] notification in
        guard let self, self.protectionEnabled, let scene = notification.object as? UIWindowScene
        else { return }
        self.cover(scene)
      },
      center.addObserver(forName: UIScene.didActivateNotification, object: nil, queue: .main) {
        [weak self] notification in
        guard let self, let scene = notification.object as? UIWindowScene else { return }
        self.uncover(scene)
      },
    ]
  }

  private func stopObservingScenes() {
    sceneObservers.forEach(NotificationCenter.default.removeObserver)
    sceneObservers = []
  }

  /// Puts the cover over every normal window of the scene that has none. System windows (the
  /// keyboard, the status bar) are left alone.
  private func cover(_ scene: UIWindowScene) {
    for window in scene.windows where window.windowLevel == .normal && !window.isHidden {
      if window.subviews.contains(where: { $0 is ScreenProtectionCoverView }) { continue }
      let cover = ScreenProtectionCoverView(frame: window.bounds)
      window.addSubview(cover)
      window.bringSubviewToFront(cover)
    }
  }

  private func uncover(_ scene: UIWindowScene) {
    for window in scene.windows {
      window.subviews.filter { $0 is ScreenProtectionCoverView }.forEach { $0.removeFromSuperview() }
    }
  }

  private func windowScenes() -> [UIWindowScene] {
    return UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
  }

  // MARK: - Text selection (PDFKit)

  /// Clears the selection of any `PDFView` as soon as it changes to a non-empty one. The observer is
  /// on every `PDFView` (object `nil`) and not on the one of a given screen, because the view is
  /// owned by the viewer's package and this module does not know it. Clearing the selection posts
  /// the notification again, with no selection, which the guard lets through.
  private func startObservingSelections() {
    guard selectionObserver == nil else { return }
    selectionObserver = NotificationCenter.default.addObserver(
      forName: .PDFViewSelectionChanged, object: nil, queue: .main
    ) { [weak self] notification in
      guard let self, self.protectionEnabled, let pdfView = notification.object as? PDFView,
        pdfView.currentSelection != nil
      else { return }
      pdfView.clearSelection()
      self.keepEditMenusDismissed(of: pdfView)
    }
  }

  /// Clearing the selection is not enough: the edit menu of the long-press (Copy, Select All) is
  /// presented when the finger is lifted, after the selection has been cleared, and is still shown
  /// then (it has nothing left to copy, but it is there). So the edit menus of the view are dismissed
  /// every `editMenuSweepInterval` for `editMenuSweepDuration` after each selection, which takes the
  /// menu away as soon as it appears. A finger held longer than that gets the empty menu.
  private func keepEditMenusDismissed(of pdfView: PDFView) {
    editMenuSweep?.invalidate()
    var remaining = Int(editMenuSweepDuration / editMenuSweepInterval)
    let sweep = Timer(timeInterval: editMenuSweepInterval, repeats: true) {
      [weak self, weak pdfView] timer in
      guard let self, let pdfView, self.protectionEnabled, remaining > 0 else {
        timer.invalidate()
        return
      }
      remaining -= 1
      self.dismissEditMenus(in: pdfView)
    }
    // The common modes, so that the sweep also runs while the view is being scrolled.
    RunLoop.main.add(sweep, forMode: .common)
    editMenuSweep = sweep
  }

  /// Dismisses the edit menus of a view and of everything under it.
  private func dismissEditMenus(in view: UIView) {
    for interaction in view.interactions {
      (interaction as? UIEditMenuInteraction)?.dismissMenu()
    }
    for subview in view.subviews {
      dismissEditMenus(in: subview)
    }
  }

  private func stopObservingSelections() {
    editMenuSweep?.invalidate()
    editMenuSweep = nil
    if let observer = selectionObserver {
      NotificationCenter.default.removeObserver(observer)
    }
    selectionObserver = nil
  }

  // MARK: - Screenshots

  private func startObservingScreenshots() {
    guard screenshotObserver == nil else { return }
    screenshotObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.sendEvent(screenshotTakenEvent, [:])
    }
  }

  private func stopObservingScreenshots() {
    if let observer = screenshotObserver {
      NotificationCenter.default.removeObserver(observer)
    }
    screenshotObserver = nil
  }

  // MARK: - Capture (recording, mirroring, AirPlay)

  private func startObservingCapture() {
    guard !observingCapture else { return }
    observingCapture = true
    lastCaptured = isCurrentlyCaptured()

    let center = NotificationCenter.default
    if #available(iOS 17.0, *) {
      // The state is a trait of the scene: observe it on each window scene, including the ones that
      // connect later.
      windowScenes().forEach { observeTraits(of: $0) }
      captureObservers.append(
        center.addObserver(forName: UIScene.willConnectNotification, object: nil, queue: .main) {
          [weak self] notification in
          guard let self, self.observingCapture, let scene = notification.object as? UIWindowScene
          else { return }
          self.observeTraits(of: scene)
          self.reportCaptureIfChanged()
        })
      captureObservers.append(
        center.addObserver(forName: UIScene.didDisconnectNotification, object: nil, queue: .main) {
          [weak self] notification in
          guard let self, let scene = notification.object as? UIScene else { return }
          self.traitRegistrations.removeAll { $0.scene === scene }
          self.reportCaptureIfChanged()
        })
    } else {
      captureObservers.append(
        center.addObserver(forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main) {
          [weak self] _ in
          self?.reportCaptureIfChanged()
        })
    }
  }

  @available(iOS 17.0, *)
  private func observeTraits(of scene: UIWindowScene) {
    guard !traitRegistrations.contains(where: { $0.scene === scene }) else { return }
    // UIKit declares the trait observation main-actor isolated. Every entry point of this module
    // has already hopped to the main queue, so the assumption holds (and is checked at run time).
    let registration = MainActor.assumeIsolated {
      scene.registerForTraitChanges([UITraitSceneCaptureState.self]) {
        [weak self] (_: UIWindowScene, _: UITraitCollection) in
        self?.reportCaptureIfChanged()
      }
    }
    traitRegistrations.append((scene: scene, registration: registration))
  }

  private func stopObservingCapture() {
    guard observingCapture else { return }
    observingCapture = false
    captureObservers.forEach(NotificationCenter.default.removeObserver)
    captureObservers = []
    if #available(iOS 17.0, *) {
      for entry in traitRegistrations {
        if let registration = entry.registration as? UITraitChangeRegistration {
          MainActor.assumeIsolated { entry.scene.unregisterForTraitChanges(registration) }
        }
      }
    }
    traitRegistrations = []
    lastCaptured = nil
  }

  private func reportCaptureIfChanged() {
    let captured = isCurrentlyCaptured()
    guard captured != lastCaptured else { return }
    lastCaptured = captured
    sendEvent(captureChangedEvent, ["captured": captured])
  }

  /// The scene capture state on iOS 17 and later, and `UIScreen.isCaptured` where the state is
  /// not specified (iOS 16, or a scene that has not been given one).
  private func isCurrentlyCaptured() -> Bool {
    let scenes = windowScenes()
    if #available(iOS 17.0, *) {
      var specified = false
      for scene in scenes {
        switch scene.traitCollection.sceneCaptureState {
        case .active:
          return true
        case .inactive:
          specified = true
        default:
          break
        }
      }
      if specified { return false }
    }
    return scenes.contains { $0.screen.isCaptured }
  }

  // MARK: - Clean-up

  private func tearDown() {
    stopObservingSelections()
    stopObservingScenes()
    stopObservingScreenshots()
    stopObservingCapture()
    for scene in windowScenes() {
      uncover(scene)
    }
    protectionEnabled = false
  }
}

/// The view over the content while the app is inactive: opaque, in the colour of the system
/// background, with nothing on it. It shows no text, so there is nothing to translate.
private final class ScreenProtectionCoverView: UIView {
  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .systemBackground
    autoresizingMask = [.flexibleWidth, .flexibleHeight]
    isUserInteractionEnabled = true
  }

  required init?(coder: NSCoder) {
    return nil
  }
}
