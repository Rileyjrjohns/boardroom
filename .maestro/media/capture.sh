#!/usr/bin/env bash
# Makes the media of the README (docs/media) from the app running on an iOS simulator: it records
# the video of the screen with `simctl`, runs the capture flow (capture.yaml) with Maestro, and
# converts the video to a GIF and the screenshots to small PNGs with ffmpeg.
#
#   npm run media:ios
#
# Not part of the test suite. Needs, besides Maestro and ffmpeg on the PATH:
#   - MEDIA_IOS_DEVICE (or E2E_IOS_DEVICE): the UDID of an iOS simulator, booted, with a RELEASE
#     build of the app made with the mock adapters installed (see the header of capture.yaml);
#   - the simulator set to English, which this script leaves alone (it needs a reboot).
# MEDIA_APP_ID overrides the bundle identifier of the installed build (com.boardroom.demo), for a
# build signed with a personal team. MEDIA_KEEP_WORK=1 keeps the raw video and the raw screenshots, for a look.
# It puts the status bar of the simulator at 9:41 with full battery and bars for the run, and clears
# the override when it ends.
set -euo pipefail

cd "$(dirname "$0")/../.."

UDID="${MEDIA_IOS_DEVICE:-${E2E_IOS_DEVICE:-}}"
if [[ -z "$UDID" ]]; then
  echo "Set MEDIA_IOS_DEVICE to the UDID of a booted iOS simulator (xcrun simctl list devices)." >&2
  exit 1
fi

APP_ID="${MEDIA_APP_ID:-com.boardroom.demo}"
OUT_DIR="docs/media"
GIF_WIDTH=320
GIF_FPS=10
# The GIF plays a little faster than the flow ran (Maestro waits for the screen to settle after each of
# its taps, and the flow pauses on top of that), and as fast as it takes to last 29 seconds at most.
GIF_MIN_SPEED=1.25
GIF_MAX_SECONDS=29
PNG_WIDTH=390
# The iOS driver of Maestro can take minutes to be ready, and the time it takes is no part of the GIF.
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-300000}"

WORK="$(mktemp -d)"
RECORDING_PID=""

finish() {
  if [[ -n "$RECORDING_PID" ]]; then
    kill -INT "$RECORDING_PID" 2>/dev/null || true
    wait "$RECORDING_PID" 2>/dev/null || true
  fi
  xcrun simctl status_bar "$UDID" clear || true
  if [[ -n "${MEDIA_KEEP_WORK:-}" ]]; then
    echo "Raw video, screenshots and logs kept in $WORK"
  else
    rm -rf "$WORK"
  fi
}
trap finish EXIT

mkdir -p "$OUT_DIR"

xcrun simctl status_bar "$UDID" override \
  --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3

# The video starts first, and Maestro takes its time to be ready: the start of the flow is found
# afterwards, in the video and in the record of the commands of Maestro, and the dead time before it
# is cut off.
xcrun simctl io "$UDID" recordVideo --codec h264 --force "$WORK/video.mov" >"$WORK/recording.log" 2>&1 &
RECORDING_PID=$!
until grep -q "Recording started" "$WORK/recording.log"; do sleep 0.2; done

# The sign-in screenshot cannot be Maestro's: it leaves out the password field, which is a secure one
# (the same goes for the pages of a protected document, see below). The screen is still while the flow
# pauses after its `takeScreenshot sign-in`, so a screenshot of simctl is taken when Maestro says it
# has passed that step.
maestro --device "$UDID" test -e APP_ID="$APP_ID" --test-output-dir "$WORK/maestro" \
  .maestro/media/capture.yaml 2>&1 |
  while IFS= read -r line; do
    printf '%s\n' "$line"
    if [[ "$line" == *"Take screenshot sign-in... COMPLETED"* ]]; then
      xcrun simctl io "$UDID" screenshot "$WORK/sign-in.png" >/dev/null 2>&1
    fi
  done

# The flow ends on the protected document. Its pages and its watermark are in a secure container,
# which iOS leaves out of the screenshots of XCTest (so of Maestro): the screenshot of simctl, and
# the video, show them.
xcrun simctl io "$UDID" screenshot "$WORK/protected-document.png" >/dev/null 2>&1

kill -INT "$RECORDING_PID"
wait "$RECORDING_PID" 2>/dev/null || true
RECORDING_PID=""

SHOTS="$(find "$WORK/maestro" -type d -name takeScreenshot | head -n 1)"
COMMANDS="$(find "$WORK/maestro" -name commands.json | head -n 1)"

# Putting the commands of the flow on the video. The clocks of the recording and of Maestro cannot be
# compared (the recording starts later than it says it does, by a time that varies), so the video is
# anchored on what it shows. The screen is the home screen until the app is launched, and the first
# big change of the picture is the window of the app opening, which comes a little after Maestro
# starts the launch (a delay measured on several runs).
LAUNCH_TO_WINDOW_MS=540
FIRST_CHANGE="$(ffmpeg -nostdin -i "$WORK/video.mov" -vf "select='gt(scene,0.3)',showinfo" -an -f null - 2>&1 \
  | grep -o 'pts_time:[0-9.]*' | head -n 1 | cut -d: -f2 || true)"
if [[ -z "$FIRST_CHANGE" ]]; then
  echo "The video shows no change: the app did not open?" >&2
  exit 1
fi

# In seconds of the video: from the sign-in screen drawn (the launch of the app is not worth showing)
# to the end of the last command.
read -r FROM TO < <(node -e '
  const commands = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const anchor = Number(process.argv[2]);
  const end = (c) => c.metadata.timestamp + c.metadata.duration;
  const launch = commands.findIndex((c) => "launchAppCommand" in c.command);
  const signIn = commands[launch + 1];
  const last = commands[commands.length - 1];
  const windowOpens = commands[launch].metadata.timestamp + Number(process.argv[3]);
  const seconds = (ms) => (anchor + (ms - windowOpens) / 1000).toFixed(2);
  console.log(seconds(end(signIn) + 100), seconds(end(last)));
' "$COMMANDS" "$FIRST_CHANGE" "$LAUNCH_TO_WINDOW_MS")

GIF_SPEED="$(node -e 'console.log(Math.max(Number(process.argv[1]), (process.argv[3] - process.argv[2]) / process.argv[4]).toFixed(2))' \
  "$GIF_MIN_SPEED" "$FROM" "$TO" "$GIF_MAX_SECONDS")"

# The palette is made for this video alone, and only the pixels that change are redrawn.
ffmpeg -y -loglevel error -ss "$FROM" -to "$TO" -i "$WORK/video.mov" \
  -vf "setpts=PTS/$GIF_SPEED,fps=$GIF_FPS,scale=$GIF_WIDTH:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  "$OUT_DIR/demo.gif"

for name in meeting offline-vote; do
  ffmpeg -y -loglevel error -i "$SHOTS/$name.png" -vf "scale=$PNG_WIDTH:-1:flags=lanczos" "$OUT_DIR/$name.png"
done
for name in sign-in protected-document; do
  ffmpeg -y -loglevel error -i "$WORK/$name.png" -vf "scale=$PNG_WIDTH:-1:flags=lanczos" "$OUT_DIR/$name.png"
done

ls -l "$OUT_DIR"
