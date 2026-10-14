// Config plugin: puts the iOS project on the UIScene life cycle, which the iOS 27 SDK requires.
// The three changes, and why they exist and when to remove them, are in ./sceneLifecycle.js; this
// file hands each of them to the mod of the prebuild that owns the file.
//
// Remove it with Expo SDK 58, whose template does the same (see ./sceneLifecycle.js).

const fs = require('node:fs');
const path = require('node:path');

const {
  IOSConfig,
  createRunOncePlugin,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const {
  SCENE_DELEGATE_FILE,
  SCENE_DELEGATE_SOURCE,
  addSceneManifest,
  patchAppDelegate,
} = require('./sceneLifecycle');

const PLUGIN_NAME = 'with-scene-lifecycle';
const PLUGIN_VERSION = '1.0.0';

/** @type {import('expo/config-plugins').ConfigPlugin} */
const withSceneLifecycle = (config) => {
  config = withAppDelegate(config, (appDelegate) => {
    appDelegate.modResults.contents = patchAppDelegate(appDelegate.modResults.contents);
    return appDelegate;
  });

  config = withInfoPlist(config, (plist) => {
    plist.modResults = addSceneManifest(plist.modResults);
    return plist;
  });

  // The scene delegate is a new Swift file: it is written next to the AppDelegate and added to the
  // sources of the app target. A file that is already there is kept as it is (somebody may have
  // extended it), and the project does not list it twice.
  config = withXcodeProject(config, (project) => {
    const { platformProjectRoot, projectName } = project.modRequest;
    if (projectName === undefined) {
      throw new Error('[withSceneLifecycle] The name of the iOS project is unknown.');
    }

    const file = path.join(platformProjectRoot, projectName, SCENE_DELEGATE_FILE);
    if (!fs.existsSync(file)) fs.writeFileSync(file, SCENE_DELEGATE_SOURCE);

    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: path.join(projectName, SCENE_DELEGATE_FILE),
      groupName: projectName,
      project: project.modResults,
    });
    return project;
  });

  return config;
};

module.exports = createRunOncePlugin(withSceneLifecycle, PLUGIN_NAME, PLUGIN_VERSION);
