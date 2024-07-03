import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { inject, injectable } from "tsyringe";
import { IHeadlessClientInfo } from "../models/fika/routes/raid/dedicated/IHeadlessClientInfo";

@injectable()
export class FikaDedicatedRaidService {
    public headlessClients: Record<string, IHeadlessClientInfo>;
    public requestedSessions: Record<string, string>;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
    ) {
        this.headlessClients = {};
        this.requestedSessions = {};

        setInterval(() => {
            const currentTime = Date.now();

            for (const headlessClientSessionId in this.headlessClients) {
                const headlessClientLastPing = this.headlessClients[headlessClientSessionId].lastPing;

                if (currentTime - headlessClientLastPing > 6000) {
                    logger.info(`Headless client removed: ${headlessClientSessionId}`);
                    delete this.headlessClients[headlessClientSessionId];
                }
            }
        }, 5000);
    }
}
