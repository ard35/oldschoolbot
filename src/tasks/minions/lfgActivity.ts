import { Task } from 'klasa';

import { availableQueues } from '../../commands/Minion/lfg';
import { addLFGLoot, addLFGNoDrops, addLFGText, prepareLFGMessage, sendLFGMessages } from '../../lib/lfg/LfgUtils';
import { LfgActivityTaskOptions } from '../../lib/types/minions';

export default class extends Task {
	async run(data: LfgActivityTaskOptions) {
		const { queueId } = data;
		const lfgQueue = availableQueues.find(queue => queue.uniqueID === queueId)!;
		let extra = lfgQueue.extraParams;

		// Add extra params to the activity
		let handleData = {
			...data,
			...extra
		};

		let lootString = prepareLFGMessage(lfgQueue.name, data.quantity, data.channels);

		const [usersWithLoot, usersWithoutLoot, extraMessage] = await lfgQueue.lfgClass.HandleTripFinish(
			handleData,
			this.client
		);

		usersWithLoot.forEach(e => {
			lootString = addLFGLoot(lootString, e.hasPurple, e.user, e.lootedItems.toString(), data.channels);
		});
		lootString = await addLFGNoDrops(lootString, this.client, usersWithoutLoot, data.channels);
		lootString = addLFGText(lootString, extraMessage, data.channels);

		await sendLFGMessages(lootString, this.client, data.channels);

		// handleTripFinish(
		// 	this.client,
		// 	leaderUser,
		// 	data.channelID,
		// 	resultStr,
		// 	undefined,
		// 	undefined,
		// 	data,
		// 	totalLoot.bank
		// );
	}
}