Pod::Spec.new do |s|
  s.name           = 'ScreenProtection'
  s.version        = '1.0.0'
  s.summary        = 'Keeps confidential screens out of the app switcher and reports screenshots and recordings.'
  s.description    = 'Local Expo module of the Boardroom app: the native side of the ScreenProtection port.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
