import UIKit
import Capacitor

/**
 * Copied into ios/App/App by native/ios/apply-ios-config.sh and registered by MainViewController.swift
 * (Capacitor 6+ local plugins must be CAPBridgedPlugin and registered on the bridge).
 * Web browsers cannot block screenshots. This hides the shop in the app switcher
 * and covers the window while AirPlay / screen recording is active.
 */
@objc(ScreenShieldPlugin)
public class ScreenShieldPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "ScreenShieldPlugin"
  public let jsName = "ScreenShield"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
  ]
  private var cover: UIView?

  @objc func enable(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      self.observe()
      self.apply(captured: UIScreen.main.isCaptured)
      call.resolve()
    }
  }

  @objc func disable(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      NotificationCenter.default.removeObserver(self)
      self.cover?.removeFromSuperview()
      self.cover = nil
      call.resolve()
    }
  }

  private func observe() {
    NotificationCenter.default.removeObserver(self)
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(capturedChanged),
      name: UIScreen.capturedDidChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(willResign),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(didBecome),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
  }

  @objc private func capturedChanged() {
    apply(captured: UIScreen.main.isCaptured)
  }

  @objc private func willResign() {
    apply(captured: true)
  }

  @objc private func didBecome() {
    apply(captured: UIScreen.main.isCaptured)
  }

  private func apply(captured: Bool) {
    guard let window = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .flatMap({ $0.windows })
      .first(where: { $0.isKeyWindow }) else { return }
    if captured {
      if cover == nil {
        let view = UIView(frame: window.bounds)
        view.backgroundColor = UIColor.black
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(view)
        cover = view
      }
    } else {
      cover?.removeFromSuperview()
      cover = nil
    }
  }
}
