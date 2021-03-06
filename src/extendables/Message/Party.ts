/* eslint-disable prefer-promise-reject-errors */
import { Extendable, ExtendableStore, KlasaMessage, KlasaUser } from 'klasa';
import { Message, MessageReaction } from 'discord.js';
import { debounce } from 'lodash';

import { MakePartyOptions } from '../../lib/types';
import { ReactionEmoji } from '../../lib/constants';
import { CustomReactionCollector } from '../../lib/structures/CustomReactionCollector';
import { sleep } from '../../lib/util';

async function _setup(
	msg: KlasaMessage,
	options: MakePartyOptions
): Promise<[KlasaUser[], () => Promise<KlasaUser[]>]> {
	const usersWhoConfirmed: KlasaUser[] = [options.leader];

	function getMessageContent() {
		return `${options.message}\n\n**Users Joined:** ${usersWhoConfirmed
			.map(u => u.username)
			.join(
				', '
			)}\n\nThis party will automatically depart in 2 minutes, or if the leader clicks the start (start early) or stop button.`;
	}

	const confirmMessage = (await msg.channel.send(getMessageContent())) as KlasaMessage;
	async function addEmojis() {
		await confirmMessage.react(ReactionEmoji.Join);
		await sleep(750);
		await confirmMessage.react(ReactionEmoji.Stop);
		await sleep(750);
		await confirmMessage.react(ReactionEmoji.Start);
	}

	addEmojis();

	// Debounce message edits to prevent spam.
	const updateUsersIn = debounce(() => {
		confirmMessage.edit(getMessageContent());
	}, 500);

	const removeUser = (user: KlasaUser) => {
		if (user === options.leader) return;
		const index = usersWhoConfirmed.indexOf(user);
		if (index !== -1) {
			usersWhoConfirmed.splice(index, 1);
			updateUsersIn();
		}
	};

	const reactionAwaiter = () =>
		new Promise<KlasaUser[]>(async (resolve, reject) => {
			const collector = new CustomReactionCollector(
				confirmMessage,
				(reaction: MessageReaction, user: KlasaUser) => {
					if (
						user.isIronman ||
						user.bot ||
						user.minionIsBusy ||
						!reaction.emoji.id ||
						!user.hasMinion
					) {
						return false;
					}

					if (options.usersAllowed && !options.usersAllowed.includes(user.id)) {
						return false;
					}

					return ([
						ReactionEmoji.Join,
						ReactionEmoji.Stop,
						ReactionEmoji.Start
					] as string[]).includes(reaction.emoji.id);
				},
				{
					time: 120_000,
					max: options.usersAllowed?.length ?? options.maxSize,
					dispose: true
				}
			);

			collector.on('remove', (reaction: MessageReaction, user: KlasaUser) => {
				if (!usersWhoConfirmed.includes(user)) return false;
				if (reaction.emoji.id !== ReactionEmoji.Join) return false;
				removeUser(user);
			});

			function startTrip() {
				if (usersWhoConfirmed.length < options.minSize) {
					reject(`Not enough people joined your ${options.party ? 'party' : 'mass'}!`);
					return;
				}

				resolve(usersWhoConfirmed);
			}

			collector.on('collect', async (reaction, user) => {
				if (user.partial) await user.fetch();
				switch (reaction.emoji.id) {
					case ReactionEmoji.Join: {
						if (usersWhoConfirmed.includes(user)) return;

						if (options.usersAllowed && !options.usersAllowed.includes(user.id)) {
							return;
						}

						// +1 because of leader
						if (usersWhoConfirmed.length >= options.maxSize + 1) {
							collector.stop('everyoneJoin');
							break;
						}

						// Add the user
						usersWhoConfirmed.push(user);
						updateUsersIn();
						break;
					}

					case ReactionEmoji.Stop: {
						if (user === options.leader) {
							reject(
								`The leader cancelled this ${options.party ? 'party' : 'mass'}!`
							);
							collector.stop('partyCreatorEnd');
						}
						break;
					}

					case ReactionEmoji.Start: {
						if (user === options.leader) {
							startTrip();
							collector.stop('partyCreatorEnd');
						}
						break;
					}
				}
			});

			collector.once('end', () => {
				confirmMessage.removeAllReactions();
				startTrip();
			});
		});

	return [usersWhoConfirmed, reactionAwaiter];
}

export default class extends Extendable {
	public constructor(store: ExtendableStore, file: string[], directory: string) {
		super(store, file, directory, { appliesTo: [Message] });
	}

	async makePartyAwaiter(this: KlasaMessage, options: MakePartyOptions) {
		const [usersWhoConfirmed, reactionAwaiter] = await _setup(this, options);

		await reactionAwaiter();

		return usersWhoConfirmed;
	}
}
