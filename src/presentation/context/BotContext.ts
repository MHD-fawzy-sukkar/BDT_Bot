import { Context } from "grammy";
import { ContentAdminService } from "../../application/services/ContentAdminService";
import { MenuAdminService } from "../../application/services/MenuAdminService";
import { MenuNavigationService } from "../../application/services/MenuNavigationService";
import { StatsAndBroadcastService } from "../../application/services/StatsAndBroadcastService";
import { Env } from "../../infrastructure/config/Env";

export interface BotServices {
  readonly navigation: MenuNavigationService;
  readonly menuAdmin: MenuAdminService;
  readonly contentAdmin: ContentAdminService;
  readonly statsAndBroadcast: StatsAndBroadcastService;
}

export interface BotContext extends Context {
  env: Env;
  services: BotServices;
  isAdminContext: boolean;
  runInBackground: (promise: Promise<unknown>) => void;
}
