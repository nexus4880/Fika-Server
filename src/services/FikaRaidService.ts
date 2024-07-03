import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { inject, injectable } from "tsyringe";

interface IHeadlessClientInfo {
    state: string;
    lastPing: number;
}

@injectable()
export class FikaRaidService {
    public headlessClients: Record<string, IHeadlessClientInfo>;
    public requestedSessions: Record<string, string>;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
    ) {
        this.headlessClients = {};
        this.requestedSessions = {};

        setInterval(this.checkLastPingRoutine, 5000);
    }

    public checkLastPingRoutine(): void {
        const currentTime = Date.now();

        for (const headlessClientSessionId in this.headlessClients) {
            const headlessClientLastPing = this.headlessClients[headlessClientSessionId].lastPing;

            if (currentTime - headlessClientLastPing > 6000) {
                this.logger.info(`removed ${headlessClientSessionId} (timeout)`);
                delete this.headlessClients[headlessClientSessionId];
            }
        }
    }
}
