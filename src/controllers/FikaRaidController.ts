import { inject, injectable } from "tsyringe";

import { FikaMatchEndSessionMessage } from "../models/enums/FikaMatchEndSessionMessages";
import { IFikaRaidServerIdRequestData } from "../models/fika/routes/raid/IFikaRaidServerIdRequestData";
import { IFikaRaidCreateRequestData } from "../models/fika/routes/raid/create/IFikaRaidCreateRequestData";
import { IFikaRaidCreateResponse } from "../models/fika/routes/raid/create/IFikaRaidCreateResponse";
import { IFikaRaidGethostResponse } from "../models/fika/routes/raid/gethost/IFikaRaidGethostResponse";
import { IFikaRaidSettingsResponse } from "../models/fika/routes/raid/getsettings/IFikaRaidSettingsResponse";
import { IFikaRaidJoinRequestData } from "../models/fika/routes/raid/join/IFikaRaidJoinRequestData";
import { IFikaRaidJoinResponse } from "../models/fika/routes/raid/join/IFikaRaidJoinResponse";
import { IFikaRaidLeaveRequestData } from "../models/fika/routes/raid/leave/IFikaRaidLeaveRequestData";
import { IFikaRaidSpawnpointResponse } from "../models/fika/routes/raid/spawnpoint/IFikaRaidSpawnpointResponse";
import { FikaMatchService } from "../services/FikaMatchService";
import { IStartDedicatedRequest } from "../models/fika/routes/raid/IStartDedicatedRequest";
import { SaveServer } from "@spt/servers/SaveServer";
import { SptWebSocketConnectionHandler } from "@spt/servers/ws/SptWebSocketConnectionHandler";
import { IStartDedicatedResponse } from "../models/fika/routes/raid/IStartDedicatedResponse";
import { FikaRaidService } from "../services/FikaRaidService";
import { ILogger } from "@spt/models/spt/utils/ILogger";

@injectable()
export class FikaRaidController {

    constructor(
        @inject("FikaMatchService") protected fikaMatchService: FikaMatchService,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("SptWebSocketConnectionHandler") protected webSocketServer: SptWebSocketConnectionHandler,
        @inject("FikaRaidService") protected fikaRaidService: FikaRaidService,
        @inject("WinstonLogger") protected logger: ILogger,
    ) {
    }

    /**
     * Handle /fika/raid/create
     * @param request
     */
    public handleRaidCreate(request: IFikaRaidCreateRequestData): IFikaRaidCreateResponse {
        return {
            success: this.fikaMatchService.createMatch(request),
        };
    }

    /**
     * Handle /fika/raid/join
     * @param request
     */
    public handleRaidJoin(request: IFikaRaidJoinRequestData): IFikaRaidJoinResponse {
        this.fikaMatchService.addPlayerToMatch(request.serverId, request.profileId, { groupId: null, isDead: false });

        const match = this.fikaMatchService.getMatch(request.serverId);

        return {
            serverId: request.serverId,
            timestamp: match.timestamp,
            expectedNumberOfPlayers: match.expectedNumberOfPlayers,
            gameVersion: match.gameVersion,
            fikaVersion: match.fikaVersion,
            raidCode: match.raidCode
        };
    }

    /**
     * Handle /fika/raid/leave
     * @param request
     */
    public handleRaidLeave(request: IFikaRaidLeaveRequestData): void {
        if (request.serverId === request.profileId) {
            this.fikaMatchService.endMatch(request.serverId, FikaMatchEndSessionMessage.HOST_SHUTDOWN_MESSAGE);
            return;
        }

        this.fikaMatchService.removePlayerFromMatch(request.serverId, request.profileId);
    }

    /**
     * Handle /fika/raid/gethost
     * @param request
     */
    public handleRaidGethost(request: IFikaRaidServerIdRequestData): IFikaRaidGethostResponse {
        const match = this.fikaMatchService.getMatch(request.serverId);
        if (!match) {
            return;
        }

        return {
            ips: match.ips,
            port: match.port,
            natPunch: match.natPunch,
        };
    }

    /**
     * Handle /fika/raid/spawnpoint
     * @param request
     */
    public handleRaidSpawnpoint(request: IFikaRaidServerIdRequestData): IFikaRaidSpawnpointResponse {
        const match = this.fikaMatchService.getMatch(request.serverId);
        if (!match) {
            return;
        }

        return {
            spawnpoint: match.spawnPoint,
        };
    }

    /**
     * Handle /fika/raid/getsettings
     * @param request
     */
    public handleRaidGetSettings(request: IFikaRaidServerIdRequestData): IFikaRaidSettingsResponse {
        const match = this.fikaMatchService.getMatch(request.serverId);
        if (!match) {
            return;
        }

        return {
            metabolismDisabled: match.raidConfig.metabolismDisabled,
            playersSpawnPlace: match.raidConfig.playersSpawnPlace
        };
    }

    /** Handle /fika/raid/startdedicated */
    handleRaidStartDedicated(sessionID: string, info: IStartDedicatedRequest): IStartDedicatedResponse {
        if (this.fikaRaidService.headlessClients.length == 0) {
            return {
                matchId: null,
                error: "No headless clients available"
            };
        }

        if (this.fikaRaidService.headlessClients.includes(sessionID)) {
            return {
                matchId: null,
                error: "A headless client is trying to use a headless client?"
            };
        }

        let headlessClient: string | undefined = undefined;
        for (const clientId of this.fikaRaidService.headlessClients) {
            /* This will ask the headless client if they are available
            if they receive this and they are not in raid they will respond
            if they do not respond within 3 seconds move on to the next headless client */
            this.webSocketServer.sendMessage(clientId, {
                type: "fika-headless-is-available",
                eventId: "fika-headless-is-available"
            });

            headlessClient = clientId;
        }

        if (!headlessClient) {
            return {
                matchId: null,
                error: "No headless clients available at this time"
            };
        }

        /*
        Associate the person who requested this with the headless client
        This is so that whenever the headless client is available to be joined
        this person (sessionID) will be sent a WS event to join the match
        */
        this.fikaRaidService.requestedSessions[headlessClient] = sessionID;

        // This is what tells the headless client to start the raid
        this.webSocketServer.sendMessage(headlessClient, {
            type: "fikaHeadlessStartRaid",
            eventId: "fikaHeadlessStartRaid",
            ...info
        } as any);

        this.logger.info(`Sent WS to ${headlessClient}`);

        return {
            // This really isn't required, I just want to make sure on the client
            matchId: headlessClient,
            error: null
        }
    }
}
