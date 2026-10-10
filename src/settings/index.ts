import { AUDIO_SETTINGS } from '../audio/audioSettings';
import { GAMEPLAY_SETTINGS } from '../game/gameplaySettings';
import { CONTROL_SETTINGS } from '../input/controlSettings';
import { BIKE_SETTINGS } from '../render/bike/bikeSettings';
import { CAMERA_SETTINGS } from '../render/cameraSettings';
import { GRAPHICS_SETTINGS } from '../render/graphicsSettings';
import { UI_SETTINGS } from '../ui/uiSettings';
import { SettingsRegistry } from './schema';

export * from './schema';

/** Every option in the game. Subsystems add their own definition arrays here. */
export const SETTINGS = new SettingsRegistry()
  .register(GRAPHICS_SETTINGS)
  .register(BIKE_SETTINGS)
  .register(CAMERA_SETTINGS)
  .register(AUDIO_SETTINGS)
  .register(CONTROL_SETTINGS)
  .register(GAMEPLAY_SETTINGS)
  .register(UI_SETTINGS);
