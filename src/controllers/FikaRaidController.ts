import { inject, injectable } from "tsyringe";

import { FikaMatchEndSessionMessage } from "../models/enums/FikaMatchEndSessionMessages";
import { IFikaRaidServerIdRequestData } from "../models/fika/routes/raid/IFikaRaidServerIdRequestData";
import { IFikaRaidCreateRequestData } from "../models/fika/routes/raid/create/IFikaRaidCreateRequestData";
import { IFikaRaidCreateResponse } from "../models/fika/routes/raid/create/IFikaRaidCreateResponse";
import { IFikaRaidGethostResponse } from "../models/fika/routes/raid/gethost/IFikaRaidGethostResponse";
import { IFikaRaidJoinRequestData } from "../models/fika/routes/raid/join/IFikaRaidJoinRequestData";
import { IFikaRaidJoinResponse } from "../models/fika/routes/raid/join/IFikaRaidJoinResponse";
import { IFikaRaidLeaveRequestData } from "../models/fika/routes/raid/leave/IFikaRaidLeaveRequestData";
import { IFikaRaidSpawnpointResponse } from "../models/fika/routes/raid/spawnpoint/IFikaRaidSpawnpointResponse";
import { IFikaRaidSettingsResponse } from "../models/fika/routes/raid/getsettings/IFikaRaidSettingsResponse";
import { FikaMatchService } from "../services/FikaMatchService";
import { IStartDedicatedRequest } from "../models/fika/routes/raid/dedicated/IStartDedicatedRequest";
import { SaveServer } from "@spt-aki/servers/SaveServer";
//import { SptWebSocketConnectionHandler } from "@spt-aki/servers/ws/SptWebSocketConnectionHandler";
import { IStartDedicatedResponse } from "../models/fika/routes/raid/dedicated/IStartDedicatedResponse";
import { FikaDedicatedRaidService } from "../services/FikaDedicatedRaidService";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { WebSocketServer } from "@spt-aki/servers/WebSocketServer";
import { IStatusDedicatedRequest } from "../models/fika/routes/raid/dedicated/IStatusDedicatedRequest";
import { IStatusDedicatedResponse } from "../models/fika/routes/raid/dedicated/IStatusDedicatedResponse";

@injectable()
export class FikaRaidController {
    constructor(
        @inject("FikaMatchService") protected fikaMatchService: FikaMatchService,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("WebSocketServer") protected webSocketServer: WebSocketServer,
        @inject("FikaDedicatedRaidService") protected fikaDedicatedRaidService: FikaDedicatedRaidService,
        @inject("WinstonLogger") protected logger: ILogger,
    ) {
        // Do nothing
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
            ip: match.ip,
            port: match.port,
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
        if (Object.keys(this.fikaDedicatedRaidService.headlessClients).length == 0) {
            return {
                matchId: null,
                error: "No headless clients available"
            };
        }

        if (sessionID in this.fikaDedicatedRaidService.headlessClients) {
            return {
                matchId: null,
                error: "A headless client is trying to use a headless client?"
            };
        }

        let headlessClient: string | undefined = undefined;
        let headlessClientWs: WebSocket | undefined = undefined;

        for (const headlessSessionId in this.fikaDedicatedRaidService.headlessClients) {
            const headlessClientInfo = this.fikaDedicatedRaidService.headlessClients[headlessSessionId];

            if (headlessClientInfo.state != "ready") {
                continue;
            }

            headlessClientWs = this.webSocketServer.getSessionWebSocket(headlessSessionId);

            if(!headlessClientWs) {
                continue;
            }

            headlessClient = headlessSessionId;
            break;
        }

        if (!headlessClient) {
            return {
                matchId: null,
                error: "No headless clients available at this time"
            };
        }

        this.fikaDedicatedRaidService.requestedSessions[headlessClient] = sessionID;

        headlessClientWs.send(
            JSON.stringify(
            {
                type: "fikaHeadlessStartRaid",
                ...info
            }
        ));

        this.logger.info(`Sent WS to ${headlessClient}`);

        return {
            // This really isn't required, I just want to make sure on the client
            matchId: headlessClient,
            error: null
        }
    }

    public handleRaidStatusDedicated(sessionId: string, info: IStatusDedicatedRequest): IStatusDedicatedResponse {
        this.fikaDedicatedRaidService.headlessClients[sessionId] =
        {
            state: info.status,
            lastPing: Date.now()
        }

        return {
            sessionId: info.sessionId,
            status: info.status
        }
    }
}
