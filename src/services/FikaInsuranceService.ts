import { InraidController } from "@spt/controllers/InraidController";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { ISaveProgressRequestData } from "@spt/models/eft/inRaid/ISaveProgressRequestData";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { SaveServer } from "@spt/servers/SaveServer";
import { InsuranceService } from "@spt/services/InsuranceService";
import { inject, injectable } from "tsyringe";

export interface IInsuranceInformation {
    allInsuranceItemIds: string[];
    itemsPlayersExtractedWith: string[];
}

@injectable()
export class FikaInsuranceService {
    // Items left in here by the time the raid ends will be removed from player insurances
    //                                  matchId        profileId
    private matchInsuranceInfos: Record<string, Record<string, IInsuranceInformation>>;
    private matchIdToPlayers: Record<string, string[]>;

    constructor(
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("InsuranceService") protected insuranceService: InsuranceService,
        @inject("InraidController") protected inraidController: InraidController,
        @inject("WinstonLogger") protected logger: ILogger,
    ) {
        this.matchInsuranceInfos = {};
        this.matchIdToPlayers = {};
    }

    public getMatchId(sessionID: string) {
        this.logger.warning(JSON.stringify(this.matchIdToPlayers));
        for (const matchId in this.matchIdToPlayers) {
            if (this.matchIdToPlayers[matchId].includes(sessionID)) {
                return matchId;
            }
        }
    }

    public addInsuranceInformation(matchId: string, sessionID: string) {
        const profile = this.saveServer.getProfile(sessionID);
        const insuredItemsOnProfile = profile.characters.pmc.InsuredItems.map(i => i.itemId);
        this.logger.info(`${sessionID} has ${insuredItemsOnProfile.length} items on profile`);

        if (!(matchId in this.matchInsuranceInfos)) {
            this.matchInsuranceInfos[matchId] = {};
        }

        this.matchInsuranceInfos[matchId][sessionID] = {
            allInsuranceItemIds: insuredItemsOnProfile,
            itemsPlayersExtractedWith: []
        };

        if (!(matchId in this.matchIdToPlayers)) {
            this.matchIdToPlayers[matchId] = [];
        }

        this.matchIdToPlayers[matchId].push(sessionID);
        this.logger.info(JSON.stringify(this.matchIdToPlayers));
    }

    public onSavePostRaidProgress(sessionID: string, matchId: string, offraidData: ISaveProgressRequestData) {
        if (!(matchId in this.matchInsuranceInfos)) {
            this.logger.error("onSavePostRaidProgress: !(matchId in this.matchInsuranceInfos)");
            return;
        }

        if (!this.matchIdToPlayers[matchId].includes(sessionID)) {
            this.logger.error(`${matchId} does not contain ${sessionID}`);
            return;
        }

        const insuranceInfos: Record<string, IInsuranceInformation> = this.matchInsuranceInfos[matchId];
        const playerItems: Item[] = offraidData.profile.Inventory.items;
        for (const insuranceInformation of Object.values(insuranceInfos)) {
            const overlap = playerItems.filter(i => insuranceInformation.allInsuranceItemIds.includes(i._id)).map(i => i._id);
            insuranceInformation.itemsPlayersExtractedWith = insuranceInformation.itemsPlayersExtractedWith.concat(overlap);
        }

        InraidController.prototype.savePostRaidProgress.call(this.inraidController, offraidData, sessionID);
        const index = this.matchIdToPlayers[matchId].indexOf(sessionID, 0);
        this.matchIdToPlayers[matchId].splice(index, 1);
        if (this.matchIdToPlayers[matchId].length == 0) {
            this.logger.info("No more players left in match, removing it");
            this.onMatchEnd(matchId);
        }
        else {
            this.logger.info(`Removed player: ${JSON.stringify(this.matchIdToPlayers)}`);
        }
    }

    public onMatchEnd(matchId: string) {
        if (!(matchId in this.matchInsuranceInfos)) {
            this.logger.error("onMatchEnd: !(matchId in this.matchInsuranceInfos)");
            return;
        }

        const matchInsuranceInfo: Record<string, IInsuranceInformation> = this.matchInsuranceInfos[matchId];
        for (const sessionID in matchInsuranceInfo) {
            const insuranceInformation = matchInsuranceInfo[sessionID];
            this.logger.info(JSON.stringify(insuranceInformation));
            if (insuranceInformation.itemsPlayersExtractedWith.length > 0) {
                this.logger.info(`${sessionID} will lose ${insuranceInformation.itemsPlayersExtractedWith.length}/${insuranceInformation.allInsuranceItemIds.length} items`);
                this.removeItemsFromInsurance(sessionID, insuranceInformation.itemsPlayersExtractedWith);
            }
        }

        delete this.matchIdToPlayers[matchId];
    }

    public removeItemsFromInsurance(sessionID: string, ids: string[]) {
        if (!this.insuranceService.insuranceExists(sessionID)) {
            this.logger.warning(`No insurance found for ${sessionID}`);
        }

        const profile = this.saveServer.getProfile(sessionID);
        if (profile.insurance && profile.insurance.length > 0) {
            this.logger.info(`${profile.insurance.length} insurances on ${sessionID}`);
            for (const insurance of profile.insurance) {
                const enteredCount = insurance.items.length;
                insurance.items = insurance.items.filter(i => !ids.includes(i._id));
                const exitCount = insurance.items.length;
                this.logger.error(`${sessionID} changed insurances length from ${enteredCount} -> ${exitCount}`);
            }

            profile.insurance = profile.insurance.filter(i => i.items.length > 0);
        }
        else {
            this.logger.error(`No insurances available on ${sessionID}`);
        }
    }
}
