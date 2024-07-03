import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { inject, injectable } from "tsyringe";
import { IHeadlessClientInfo } from "../models/fika/routes/raid/dedicated/IHeadlessClientInfo";
import { WebSocketServer } from "@spt-aki/servers/WebSocketServer";

@injectable()
export class FikaDedicatedRaidService {
    public headlessClients: Record<string, IHeadlessClientInfo>;
    public requestedSessions: Record<string, string>;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("WebSocketServer") protected webSocketServer: WebSocketServer,
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

    public handleRequestedSessions(matchId: string): void {
        if (matchId in this.requestedSessions) {
            const userToJoin = this.requestedSessions[matchId];
            delete this.requestedSessions[matchId];

            const webSocket = this.webSocketServer.getSessionWebSocket(userToJoin);

            webSocket.send(JSON.stringify(
                {
                    type: "fikaJoinMatch",
                    matchId: matchId
                }
            ));

            this.logger.info(`Told ${userToJoin} to join raid ${matchId}`);
        }
    }
}
