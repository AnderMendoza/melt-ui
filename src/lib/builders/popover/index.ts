import {
	addEventListener,
	effect,
	generateId,
	hiddenAction,
	isBrowser,
	noop,
	sleep,
	styleToString,
} from '$lib/internal/helpers';

import { usePopper, type FloatingConfig } from '$lib/internal/actions';
import type { Defaults } from '$lib/internal/types';
import { tick } from 'svelte';
import { derived, readable, writable } from 'svelte/store';

export type CreatePopoverArgs = {
	positioning?: FloatingConfig;
	arrowSize?: number;
	open?: boolean;
};

const defaults = {
	positioning: {
		placement: 'bottom',
	},
	arrowSize: 8,
	open: false,
} satisfies Defaults<CreatePopoverArgs>;

export function createPopover(args?: CreatePopoverArgs) {
	const options = { ...defaults, ...args } as CreatePopoverArgs;
	const positioning = readable(options.positioning);
	const arrowSize = readable(options.arrowSize);
	const open = writable(options.open);

	const activeTrigger = writable<HTMLElement | null>(null);

	const ids = {
		content: generateId(),
	};

	const content = {
		...derived([open], ([$open]) => {
			return {
				hidden: $open ? undefined : true,
				tabindex: -1,
				style: styleToString({
					display: $open ? undefined : 'none',
				}),
				id: ids.content,
			};
		}),
		action: (node: HTMLElement) => {
			let unsubPopper = noop;

			const unsubDerived = effect(
				[open, activeTrigger, positioning],
				([$open, $activeTrigger, $positioning]) => {
					unsubPopper();
					if ($open && $activeTrigger) {
						tick().then(() => {
							const popper = usePopper(node, {
								anchorElement: $activeTrigger,
								open,
								options: {
									floating: $positioning,
								},
							});

							if (popper && popper.destroy) {
								unsubPopper = popper.destroy;
							}
						});
					}
				}
			);

			return {
				destroy() {
					unsubDerived();
					unsubPopper();
				},
			};
		},
	};

	const trigger = {
		...derived([open], ([$open]) => {
			return {
				role: 'button',
				'aria-haspopup': 'dialog',
				'aria-expanded': $open,
				'data-state': $open ? 'open' : 'closed',
				'aria-controls': ids.content,
			} as const;
		}),
		action: (node: HTMLElement) => {
			const unsub = addEventListener(node, 'click', () => {
				open.update((prev) => {
					const isOpen = !prev;
					if (isOpen) {
						activeTrigger.set(node);
					} else {
						activeTrigger.set(null);
					}
					return isOpen;
				});
			});

			return {
				destroy: unsub,
			};
		},
	};

	const arrow = derived(arrowSize, ($arrowSize) => ({
		'data-arrow': true,
		style: styleToString({
			position: 'absolute',
			width: `var(--arrow-size, ${$arrowSize}px)`,
			height: `var(--arrow-size, ${$arrowSize}px)`,
		}),
	}));

	const close = hiddenAction({
		type: 'button',
		action: (node: HTMLElement) => {
			const unsub = addEventListener(node, 'click', () => {
				open.set(false);
			});

			return {
				destroy: unsub,
			};
		},
	} as const);

	effect([open, activeTrigger], ([$open, $activeTrigger]) => {
		if (!isBrowser) return;

		if (!$open && $activeTrigger && isBrowser) {
			// Prevent the keydown event from triggering on the trigger
			sleep(1).then(() => $activeTrigger.focus());
		}
	});

	return { trigger, open, content, arrow, close };
}
