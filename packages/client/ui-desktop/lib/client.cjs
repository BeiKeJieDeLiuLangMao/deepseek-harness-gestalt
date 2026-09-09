window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-desktop",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region src/client/BrandSeat.tsx
		/**
		* Render the GESTALT wordmark.
		* @param _props - chain owner share (wide is unused; the shell unmounts this on the rail).
		* @returns the wordmark svg.
		*/
		function BrandSeat(_props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.BrandWordmark, { badge: "gestalt" });
		}
		//#endregion
		//#region \0dsh-css:/Users/yishu.cy/IdeaProjects/deepseek-harness/packages/client/ui-desktop/src/client/DragStrip.module.css.mjs
		const css$8 = ":root{--dsh-window-chrome-height:36px}.cYaaqG_strip{z-index:7;height:var(--dsh-window-chrome-height);background:var(--dsw-specific-sidebar-fill);-webkit-app-region:drag;align-items:stretch;display:flex;position:fixed;top:0;left:0;right:0}.cYaaqG_macChrome{z-index:5;top:0;right:var(--dsh-sidebar-width,0px);height:var(--dsh-window-chrome-height);background:var(--dsw-specific-sidebar-fill);-webkit-app-region:drag;position:fixed;left:0}.cYaaqG_drag{flex:auto;min-width:0}.cYaaqG_captions{-webkit-app-region:no-drag;flex:none;display:flex}.cYaaqG_caption{width:46px;height:var(--dsh-window-chrome-height);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:14px;line-height:var(--dsh-window-chrome-height);background:0 0;border:none}.cYaaqG_caption:hover{background:var(--dsw-alias-interactive-bg-hover)}.cYaaqG_caption:last-child:hover{color:#fff;background:#c42b1c}";
		const tagId$8 = "@deepseek-ai/dsh-client-ui-desktop/DragStrip.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$8) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-desktop";
			tag.dataset.pluginCss = tagId$8;
			tag.textContent = css$8;
			document.head.appendChild(tag);
		}
		var DragStrip_module_css_default = {
			"caption": "cYaaqG_caption",
			"captions": "cYaaqG_captions",
			"drag": "cYaaqG_drag",
			"macChrome": "cYaaqG_macChrome",
			"strip": "cYaaqG_strip"
		};
		//#endregion
		//#region src/client/DragStrip.tsx
		/**
		* Render the drag region. Windows paints caption buttons on the right.
		* @param props - composed slot props.
		* @returns the drag strip.
		*/
		function DragStrip({ t }) {
			const desktop = window.dshDesktop;
			const windows = desktop?.platform === "win32";
			const mac = desktop?.platform === "darwin";
			if (!windows && !mac) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: windows ? DragStrip_module_css_default.strip : DragStrip_module_css_default.macChrome,
				"data-desktop-chrome": windows ? "win" : "mac",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: DragStrip_module_css_default.drag }), windows && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: DragStrip_module_css_default.captions,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: DragStrip_module_css_default.caption,
							"aria-label": t("window.minimize"),
							onClick: () => {
								desktop.windowMinimize();
							},
							children: "–"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: DragStrip_module_css_default.caption,
							"aria-label": t("window.maximize"),
							onClick: () => {
								desktop.windowMaximize();
							},
							children: "□"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: DragStrip_module_css_default.caption,
							"aria-label": t("window.close"),
							onClick: () => {
								desktop.windowClose();
							},
							children: "×"
						})
					]
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/yishu.cy/IdeaProjects/deepseek-harness/packages/client/ui-desktop/src/client/UpdateControl.module.css.mjs
		const css$7 = "._32TDjW_wide,._32TDjW_rail{cursor:pointer;color:var(--dsw-alias-label-primary);background:0 0;border:none;flex:none;align-items:center;gap:8px;font-family:inherit;font-size:14px;line-height:22px;display:flex}._32TDjW_wide{border-radius:12px;width:100%;min-width:0;height:34px;margin:4px 0;padding:6px 10px}._32TDjW_rail{border-radius:50%;justify-content:center;width:36px;height:36px;margin:8px 0 0;padding:0}._32TDjW_wide:hover,._32TDjW_rail:hover{background:var(--dsw-alias-interactive-bg-hover)}._32TDjW_wide:disabled,._32TDjW_rail:disabled{cursor:default;opacity:.6}._32TDjW_dot{background:var(--dsw-alias-label-tertiary);border-radius:50%;width:8px;height:8px}._32TDjW_dot[data-state=available],._32TDjW_dot[data-state=downloaded]{background:var(--dsw-alias-button-info-fill)}._32TDjW_dot[data-state=error]{background:var(--dsw-alias-state-error-primary)}._32TDjW_dot[data-state=downloading],._32TDjW_dot[data-state=preparing],._32TDjW_dot[data-state=checking],._32TDjW_dot[data-state=installing]{background:var(--dsw-alias-state-success-primary)}._32TDjW_label{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}";
		const tagId$7 = "@deepseek-ai/dsh-client-ui-desktop/UpdateControl.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$7) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-desktop";
			tag.dataset.pluginCss = tagId$7;
			tag.textContent = css$7;
			document.head.appendChild(tag);
		}
		var UpdateControl_module_css_default = {
			"dot": "_32TDjW_dot",
			"label": "_32TDjW_label",
			"rail": "_32TDjW_rail",
			"wide": "_32TDjW_wide"
		};
		//#endregion
		//#region src/client/UpdateControl.tsx
		/**
		* Render the Update Control.
		* @param props - composed slot props.
		* @returns the actionable control, a hidden state marker while inactive, or null without the Desktop bridge.
		*/
		function UpdateControl({ wide, t, useUpdater }) {
			const desktop = window.dshDesktop;
			if (desktop === void 0) return null;
			const status = useUpdater((snapshot) => snapshot);
			if (!isVisible(status)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				hidden: true,
				"data-desktop-updater-state": status.state
			});
			const label = labelOf(status, t);
			const onClick = () => {
				applyUpdaterClick(status.state, desktop);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: wide ? UpdateControl_module_css_default.wide : UpdateControl_module_css_default.rail,
				"data-desktop-update-control": "",
				"aria-label": label,
				title: status.state === "error" ? status.errorMessage : void 0,
				disabled: status.state === "downloading" || status.state === "preparing" || status.state === "installing",
				onClick,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: UpdateControl_module_css_default.dot,
					"data-state": status.state
				}), wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: UpdateControl_module_css_default.label,
					children: label
				})]
			});
		}
		/**
		* Apply one Update Control click to the Desktop bridge.
		* @param state - current updater phase.
		* @param desktop - preload bridge.
		*/
		function applyUpdaterClick(state, desktop) {
			switch (state) {
				case "available":
					desktop.downloadNow();
					return;
				case "downloaded":
					desktop.quitAndInstall();
					return;
				case "idle":
				case "error":
				case "disabled":
					desktop.checkNow();
					return;
				case "checking":
				case "downloading":
				case "preparing":
				case "installing": return;
			}
		}
		function formatDownloadPercent(percent) {
			if (percent === void 0 || !Number.isFinite(percent)) return "0";
			return String(Math.max(0, Math.min(100, Math.trunc(percent))));
		}
		function isVisible(status) {
			switch (status.state) {
				case "available":
				case "downloading":
				case "preparing":
				case "downloaded":
				case "installing": return true;
				case "error": return status.newVersion !== void 0;
				case "disabled":
				case "idle":
				case "checking": return false;
			}
		}
		function labelOf(status, t) {
			switch (status.state) {
				case "available": return t("update.available").replace("{version}", status.newVersion ?? "");
				case "downloading": return t("update.downloading").replace("{percent}", formatDownloadPercent(status.downloadPercent));
				case "preparing": return t("update.preparing");
				case "downloaded":
				case "installing": return t("update.install");
				case "error": return t("update.error");
				/* v8 ignore next -- closed UpdaterPhase union */
				default: return status.state;
			}
		}
		//#endregion
		//#region ../../platform/platform-account/src/privacy.ts
		/** Bilingual retention notice every installation displays before authorization. */
		const ACCOUNT_PRIVACY_NOTICE = {
			zh: "Platform 会保存 GitHub 数字 ID、公开登录名与头像，以及安装和配对元数据。原始 IP 日志最多保留 7 天，非内容安全事件最多保留 30 天；加密附件只在传输所需的短期内保留。首个版本不提供账号删除；退出登录只撤销当前安装，不删除个人配对。",
			en: "Platform stores the numeric GitHub id, public login and avatar, plus installation and pairing metadata. Raw IP logs are retained for at most 7 days, content-free security events for at most 30 days, and encrypted attachment blobs only for the short transfer lifetime. The first version does not provide account deletion; signing out revokes only this installation and does not delete Personal Pairings."
		};
		//#endregion
		//#region ../../../node_modules/.pnpm/uqr@0.1.3/node_modules/uqr/dist/index.mjs
		var QrCodeDataType = /* @__PURE__ */ ((QrCodeDataType2) => {
			QrCodeDataType2[QrCodeDataType2["Border"] = -1] = "Border";
			QrCodeDataType2[QrCodeDataType2["Data"] = 0] = "Data";
			QrCodeDataType2[QrCodeDataType2["Function"] = 1] = "Function";
			QrCodeDataType2[QrCodeDataType2["Position"] = 2] = "Position";
			QrCodeDataType2[QrCodeDataType2["Timing"] = 3] = "Timing";
			QrCodeDataType2[QrCodeDataType2["Alignment"] = 4] = "Alignment";
			return QrCodeDataType2;
		})(QrCodeDataType || {});
		const LOW = [0, 1];
		const MEDIUM = [1, 0];
		const QUARTILE = [2, 3];
		const HIGH = [3, 2];
		const EccMap = {
			L: LOW,
			M: MEDIUM,
			Q: QUARTILE,
			H: HIGH
		};
		const NUMERIC_REGEX = /^\d*$/;
		const ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+./:-]*$/;
		const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
		const MIN_VERSION = 1;
		const MAX_VERSION = 40;
		const PENALTY_N1 = 3;
		const PENALTY_N2 = 3;
		const PENALTY_N3 = 40;
		const PENALTY_N4 = 10;
		const ECC_CODEWORDS_PER_BLOCK = [
			[
				-1,
				7,
				10,
				15,
				20,
				26,
				18,
				20,
				24,
				30,
				18,
				20,
				24,
				26,
				30,
				22,
				24,
				28,
				30,
				28,
				28,
				28,
				28,
				30,
				30,
				26,
				28,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30
			],
			[
				-1,
				10,
				16,
				26,
				18,
				24,
				16,
				18,
				22,
				22,
				26,
				30,
				22,
				22,
				24,
				24,
				28,
				28,
				26,
				26,
				26,
				26,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28,
				28
			],
			[
				-1,
				13,
				22,
				18,
				26,
				18,
				24,
				18,
				22,
				20,
				24,
				28,
				26,
				24,
				20,
				30,
				24,
				28,
				28,
				26,
				30,
				28,
				30,
				30,
				30,
				30,
				28,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30
			],
			[
				-1,
				17,
				28,
				22,
				16,
				22,
				28,
				26,
				26,
				24,
				28,
				24,
				28,
				22,
				24,
				24,
				30,
				28,
				28,
				26,
				28,
				30,
				24,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30,
				30
			]
		];
		const NUM_ERROR_CORRECTION_BLOCKS = [
			[
				-1,
				1,
				1,
				1,
				1,
				1,
				2,
				2,
				2,
				2,
				4,
				4,
				4,
				4,
				4,
				6,
				6,
				6,
				6,
				7,
				8,
				8,
				9,
				9,
				10,
				12,
				12,
				12,
				13,
				14,
				15,
				16,
				17,
				18,
				19,
				19,
				20,
				21,
				22,
				24,
				25
			],
			[
				-1,
				1,
				1,
				1,
				2,
				2,
				4,
				4,
				4,
				5,
				5,
				5,
				8,
				9,
				9,
				10,
				10,
				11,
				13,
				14,
				16,
				17,
				17,
				18,
				20,
				21,
				23,
				25,
				26,
				28,
				29,
				31,
				33,
				35,
				37,
				38,
				40,
				43,
				45,
				47,
				49
			],
			[
				-1,
				1,
				1,
				2,
				2,
				4,
				4,
				6,
				6,
				8,
				8,
				8,
				10,
				12,
				16,
				12,
				17,
				16,
				18,
				21,
				20,
				23,
				23,
				25,
				27,
				29,
				34,
				34,
				35,
				38,
				40,
				43,
				45,
				48,
				51,
				53,
				56,
				59,
				62,
				65,
				68
			],
			[
				-1,
				1,
				1,
				2,
				4,
				4,
				4,
				5,
				6,
				8,
				8,
				11,
				11,
				16,
				16,
				18,
				16,
				19,
				21,
				25,
				25,
				25,
				34,
				30,
				32,
				35,
				37,
				40,
				42,
				45,
				48,
				51,
				54,
				57,
				60,
				63,
				66,
				70,
				74,
				77,
				81
			]
		];
		var QrCode = class {
			constructor(version, ecc, dataCodewords, msk) {
				this.version = version;
				this.ecc = ecc;
				if (version < MIN_VERSION || version > MAX_VERSION) throw new RangeError("Version value out of range");
				if (msk < -1 || msk > 7) throw new RangeError("Mask value out of range");
				this.size = version * 4 + 17;
				const row = Array.from({ length: this.size }).fill(false);
				for (let i = 0; i < this.size; i++) {
					this.modules.push(row.slice());
					this.types.push(row.map(() => 0));
				}
				this.drawFunctionPatterns();
				const allCodewords = this.addEccAndInterleave(dataCodewords);
				this.drawCodewords(allCodewords);
				if (msk === -1) {
					let minPenalty = 1e9;
					for (let i = 0; i < 8; i++) {
						this.applyMask(i);
						this.drawFormatBits(i);
						const penalty = this.getPenaltyScore();
						if (penalty < minPenalty) {
							msk = i;
							minPenalty = penalty;
						}
						this.applyMask(i);
					}
				}
				this.mask = msk;
				this.applyMask(msk);
				this.drawFormatBits(msk);
			}
			size;
			mask;
			modules = [];
			types = [];
			getModule(x, y) {
				return x >= 0 && x < this.size && y >= 0 && y < this.size && this.modules[y][x];
			}
			drawFunctionPatterns() {
				for (let i = 0; i < this.size; i++) {
					this.setFunctionModule(6, i, i % 2 === 0, QrCodeDataType.Timing);
					this.setFunctionModule(i, 6, i % 2 === 0, QrCodeDataType.Timing);
				}
				this.drawFinderPattern(3, 3);
				this.drawFinderPattern(this.size - 4, 3);
				this.drawFinderPattern(3, this.size - 4);
				const alignPatPos = this.getAlignmentPatternPositions();
				const numAlign = alignPatPos.length;
				for (let i = 0; i < numAlign; i++) for (let j = 0; j < numAlign; j++) if (!(i === 0 && j === 0 || i === 0 && j === numAlign - 1 || i === numAlign - 1 && j === 0)) this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
				this.drawFormatBits(0);
				this.drawVersion();
			}
			drawFormatBits(mask) {
				const data = this.ecc[1] << 3 | mask;
				let rem = data;
				for (let i = 0; i < 10; i++) rem = rem << 1 ^ (rem >>> 9) * 1335;
				const bits = (data << 10 | rem) ^ 21522;
				for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i));
				this.setFunctionModule(8, 7, getBit(bits, 6));
				this.setFunctionModule(8, 8, getBit(bits, 7));
				this.setFunctionModule(7, 8, getBit(bits, 8));
				for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i));
				for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
				for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
				this.setFunctionModule(8, this.size - 8, true);
			}
			drawVersion() {
				if (this.version < 7) return;
				let rem = this.version;
				for (let i = 0; i < 12; i++) rem = rem << 1 ^ (rem >>> 11) * 7973;
				const bits = this.version << 12 | rem;
				for (let i = 0; i < 18; i++) {
					const color = getBit(bits, i);
					const a = this.size - 11 + i % 3;
					const b = Math.floor(i / 3);
					this.setFunctionModule(a, b, color);
					this.setFunctionModule(b, a, color);
				}
			}
			drawFinderPattern(x, y) {
				for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
					const dist = Math.max(Math.abs(dx), Math.abs(dy));
					const xx = x + dx;
					const yy = y + dy;
					if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4, QrCodeDataType.Position);
				}
			}
			drawAlignmentPattern(x, y) {
				for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, QrCodeDataType.Alignment);
			}
			setFunctionModule(x, y, isDark, type = QrCodeDataType.Function) {
				this.modules[y][x] = isDark;
				this.types[y][x] = type;
			}
			addEccAndInterleave(data) {
				const ver = this.version;
				const ecl = this.ecc;
				if (data.length !== getNumDataCodewords(ver, ecl)) throw new RangeError("Invalid argument");
				const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl[0]][ver];
				const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl[0]][ver];
				const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
				const numShortBlocks = numBlocks - rawCodewords % numBlocks;
				const shortBlockLen = Math.floor(rawCodewords / numBlocks);
				const blocks = [];
				const rsDiv = reedSolomonComputeDivisor(blockEccLen);
				for (let i = 0, k = 0; i < numBlocks; i++) {
					const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
					k += dat.length;
					const ecc = reedSolomonComputeRemainder(dat, rsDiv);
					if (i < numShortBlocks) dat.push(0);
					blocks.push(dat.concat(ecc));
				}
				const result = [];
				for (let i = 0; i < blocks[0].length; i++) blocks.forEach((block, j) => {
					if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
				});
				return result;
			}
			drawCodewords(data) {
				if (data.length !== Math.floor(getNumRawDataModules(this.version) / 8)) throw new RangeError("Invalid argument");
				let i = 0;
				for (let right = this.size - 1; right >= 1; right -= 2) {
					if (right === 6) right = 5;
					for (let vert = 0; vert < this.size; vert++) for (let j = 0; j < 2; j++) {
						const x = right - j;
						const y = (right + 1 & 2) === 0 ? this.size - 1 - vert : vert;
						if (!this.types[y][x] && i < data.length * 8) {
							this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
							i++;
						}
					}
				}
			}
			applyMask(mask) {
				if (mask < 0 || mask > 7) throw new RangeError("Mask value out of range");
				for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
					let invert;
					switch (mask) {
						case 0:
							invert = (x + y) % 2 === 0;
							break;
						case 1:
							invert = y % 2 === 0;
							break;
						case 2:
							invert = x % 3 === 0;
							break;
						case 3:
							invert = (x + y) % 3 === 0;
							break;
						case 4:
							invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
							break;
						case 5:
							invert = x * y % 2 + x * y % 3 === 0;
							break;
						case 6:
							invert = (x * y % 2 + x * y % 3) % 2 === 0;
							break;
						case 7:
							invert = ((x + y) % 2 + x * y % 3) % 2 === 0;
							break;
						default: throw new Error("Unreachable");
					}
					if (!this.types[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
				}
			}
			getPenaltyScore() {
				let result = 0;
				for (let y = 0; y < this.size; y++) {
					let runColor = false;
					let runX = 0;
					const runHistory = [
						0,
						0,
						0,
						0,
						0,
						0,
						0
					];
					for (let x = 0; x < this.size; x++) if (this.modules[y][x] === runColor) {
						runX++;
						if (runX === 5) result += PENALTY_N1;
						else if (runX > 5) result++;
					} else {
						this.finderPenaltyAddHistory(runX, runHistory);
						if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
						runColor = this.modules[y][x];
						runX = 1;
					}
					result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3;
				}
				for (let x = 0; x < this.size; x++) {
					let runColor = false;
					let runY = 0;
					const runHistory = [
						0,
						0,
						0,
						0,
						0,
						0,
						0
					];
					for (let y = 0; y < this.size; y++) if (this.modules[y][x] === runColor) {
						runY++;
						if (runY === 5) result += PENALTY_N1;
						else if (runY > 5) result++;
					} else {
						this.finderPenaltyAddHistory(runY, runHistory);
						if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
						runColor = this.modules[y][x];
						runY = 1;
					}
					result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3;
				}
				for (let y = 0; y < this.size - 1; y++) for (let x = 0; x < this.size - 1; x++) {
					const color = this.modules[y][x];
					if (color === this.modules[y][x + 1] && color === this.modules[y + 1][x] && color === this.modules[y + 1][x + 1]) result += PENALTY_N2;
				}
				let dark = 0;
				for (const row of this.modules) dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark);
				const total = this.size * this.size;
				const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
				result += k * PENALTY_N4;
				return result;
			}
			getAlignmentPatternPositions() {
				if (this.version === 1) return [];
				else {
					const numAlign = Math.floor(this.version / 7) + 2;
					const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
					const result = [6];
					for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
					return result;
				}
			}
			finderPenaltyCountPatterns(runHistory) {
				const n = runHistory[1];
				const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
				return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
			}
			finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
				if (currentRunColor) {
					this.finderPenaltyAddHistory(currentRunLength, runHistory);
					currentRunLength = 0;
				}
				currentRunLength += this.size;
				this.finderPenaltyAddHistory(currentRunLength, runHistory);
				return this.finderPenaltyCountPatterns(runHistory);
			}
			finderPenaltyAddHistory(currentRunLength, runHistory) {
				if (runHistory[0] === 0) currentRunLength += this.size;
				runHistory.pop();
				runHistory.unshift(currentRunLength);
			}
		};
		function appendBits(val, len, bb) {
			if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError("Value out of range");
			for (let i = len - 1; i >= 0; i--) bb.push(val >>> i & 1);
		}
		function getBit(x, i) {
			return (x >>> i & 1) !== 0;
		}
		var QrSegment = class {
			constructor(mode, numChars, bitData) {
				this.mode = mode;
				this.numChars = numChars;
				this.bitData = bitData;
				if (numChars < 0) throw new RangeError("Invalid argument");
				this.bitData = bitData.slice();
			}
			getData() {
				return this.bitData.slice();
			}
		};
		const MODE_NUMERIC = [
			1,
			10,
			12,
			14
		];
		const MODE_ALPHANUMERIC = [
			2,
			9,
			11,
			13
		];
		const MODE_BYTE = [
			4,
			8,
			16,
			16
		];
		function numCharCountBits(mode, ver) {
			return mode[Math.floor((ver + 7) / 17) + 1];
		}
		function makeBytes(data) {
			const bb = [];
			for (const b of data) appendBits(b, 8, bb);
			return new QrSegment(MODE_BYTE, data.length, bb);
		}
		function makeNumeric(digits) {
			if (!isNumeric(digits)) throw new RangeError("String contains non-numeric characters");
			const bb = [];
			for (let i = 0; i < digits.length;) {
				const n = Math.min(digits.length - i, 3);
				appendBits(Number.parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
				i += n;
			}
			return new QrSegment(MODE_NUMERIC, digits.length, bb);
		}
		function makeAlphanumeric(text) {
			if (!isAlphanumeric(text)) throw new RangeError("String contains unencodable characters in alphanumeric mode");
			const bb = [];
			let i;
			for (i = 0; i + 2 <= text.length; i += 2) {
				let temp = ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
				temp += ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
				appendBits(temp, 11, bb);
			}
			if (i < text.length) appendBits(ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
			return new QrSegment(MODE_ALPHANUMERIC, text.length, bb);
		}
		function makeSegments(text) {
			if (text === "") return [];
			else if (isNumeric(text)) return [makeNumeric(text)];
			else if (isAlphanumeric(text)) return [makeAlphanumeric(text)];
			else return [makeBytes(toUtf8ByteArray(text))];
		}
		function isNumeric(text) {
			return NUMERIC_REGEX.test(text);
		}
		function isAlphanumeric(text) {
			return ALPHANUMERIC_REGEX.test(text);
		}
		function getTotalBits(segs, version) {
			let result = 0;
			for (const seg of segs) {
				const ccbits = numCharCountBits(seg.mode, version);
				if (seg.numChars >= 1 << ccbits) return Number.POSITIVE_INFINITY;
				result += 4 + ccbits + seg.bitData.length;
			}
			return result;
		}
		function toUtf8ByteArray(str) {
			str = encodeURI(str);
			const result = [];
			for (let i = 0; i < str.length; i++) if (str.charAt(i) !== "%") result.push(str.charCodeAt(i));
			else {
				result.push(Number.parseInt(str.substring(i + 1, i + 3), 16));
				i += 2;
			}
			return result;
		}
		function getNumRawDataModules(ver) {
			if (ver < MIN_VERSION || ver > MAX_VERSION) throw new RangeError("Version number out of range");
			let result = (16 * ver + 128) * ver + 64;
			if (ver >= 2) {
				const numAlign = Math.floor(ver / 7) + 2;
				result -= (25 * numAlign - 10) * numAlign - 55;
				if (ver >= 7) result -= 36;
			}
			return result;
		}
		function getNumDataCodewords(ver, ecl) {
			return Math.floor(getNumRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ecl[0]][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl[0]][ver];
		}
		function reedSolomonComputeDivisor(degree) {
			if (degree < 1 || degree > 255) throw new RangeError("Degree out of range");
			const result = [];
			for (let i = 0; i < degree - 1; i++) result.push(0);
			result.push(1);
			let root = 1;
			for (let i = 0; i < degree; i++) {
				for (let j = 0; j < result.length; j++) {
					result[j] = reedSolomonMultiply(result[j], root);
					if (j + 1 < result.length) result[j] ^= result[j + 1];
				}
				root = reedSolomonMultiply(root, 2);
			}
			return result;
		}
		function reedSolomonComputeRemainder(data, divisor) {
			const result = divisor.map((_) => 0);
			for (const b of data) {
				const factor = b ^ result.shift();
				result.push(0);
				divisor.forEach((coef, i) => result[i] ^= reedSolomonMultiply(coef, factor));
			}
			return result;
		}
		function reedSolomonMultiply(x, y) {
			if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError("Byte out of range");
			let z = 0;
			for (let i = 7; i >= 0; i--) {
				z = z << 1 ^ (z >>> 7) * 285;
				z ^= (y >>> i & 1) * x;
			}
			return z;
		}
		function encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) {
			if (!(MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= MAX_VERSION) || mask < -1 || mask > 7) throw new RangeError("Invalid value");
			let version;
			let dataUsedBits;
			for (version = minVersion;; version++) {
				const dataCapacityBits2 = getNumDataCodewords(version, ecl) * 8;
				const usedBits = getTotalBits(segs, version);
				if (usedBits <= dataCapacityBits2) {
					dataUsedBits = usedBits;
					break;
				}
				if (version >= maxVersion) throw new RangeError("Data too long");
			}
			for (const newEcl of [
				MEDIUM,
				QUARTILE,
				HIGH
			]) if (boostEcl && dataUsedBits <= getNumDataCodewords(version, newEcl) * 8) ecl = newEcl;
			const bb = [];
			for (const seg of segs) {
				appendBits(seg.mode[0], 4, bb);
				appendBits(seg.numChars, numCharCountBits(seg.mode, version), bb);
				for (const b of seg.getData()) bb.push(b);
			}
			const dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
			appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
			appendBits(0, (8 - bb.length % 8) % 8, bb);
			for (let padByte = 236; bb.length < dataCapacityBits; padByte ^= 253) appendBits(padByte, 8, bb);
			const dataCodewords = Array.from({ length: Math.ceil(bb.length / 8) }, () => 0);
			bb.forEach((b, i) => dataCodewords[i >>> 3] |= b << 7 - (i & 7));
			return new QrCode(version, ecl, dataCodewords, mask);
		}
		function encode(data, options) {
			const { ecc = "L", boostEcc = false, minVersion = 1, maxVersion = 40, maskPattern = -1, border = 1 } = options || {};
			const segment = typeof data === "string" ? makeSegments(data) : Array.isArray(data) ? [makeBytes(data)] : void 0;
			if (!segment) throw new Error(`uqr only supports encoding string and binary data, but got: ${typeof data}`);
			const qr = encodeSegments(segment, EccMap[ecc], minVersion, maxVersion, maskPattern, boostEcc);
			const result = addBorder({
				version: qr.version,
				maskPattern: qr.mask,
				size: qr.size,
				data: qr.modules,
				types: qr.types
			}, border);
			if (options?.invert) result.data = result.data.map((row) => row.map((mod) => !mod));
			options?.onEncoded?.(result);
			return result;
		}
		function addBorder(input, border = 1) {
			if (!border) return input;
			const { size } = input;
			const newSize = size + border * 2;
			input.size = newSize;
			input.data.forEach((row) => {
				for (let i = 0; i < border; i++) {
					row.unshift(false);
					row.push(false);
				}
			});
			for (let i = 0; i < border; i++) {
				input.data.unshift(Array.from({ length: newSize }, (_) => false));
				input.data.push(Array.from({ length: newSize }, (_) => false));
			}
			const b = QrCodeDataType.Border;
			input.types.forEach((row) => {
				for (let i = 0; i < border; i++) {
					row.unshift(b);
					row.push(b);
				}
			});
			for (let i = 0; i < border; i++) {
				input.types.unshift(Array.from({ length: newSize }, (_) => b));
				input.types.push(Array.from({ length: newSize }, (_) => b));
			}
			return input;
		}
		//#endregion
		//#region \0dsh-css:/Users/yishu.cy/IdeaProjects/deepseek-harness/packages/client/ui-desktop/src/client/AccountControl.module.css.mjs
		const css$6 = ".kkzEFq_root{gap:20px;max-width:640px;display:grid}.kkzEFq_header{align-items:center;gap:12px;display:flex}.kkzEFq_mark{color:#fff;background:#171719;border-radius:12px;flex:none;place-items:center;width:36px;height:36px;font-size:15px;font-weight:700;display:grid}.kkzEFq_profileAvatar{object-fit:cover}.kkzEFq_pairing{border-top:1px solid var(--dsw-alias-border-l2);gap:16px;padding-top:18px;display:grid}.kkzEFq_mobileAccess{justify-content:space-between;align-items:center;gap:20px;display:flex}.kkzEFq_mobileAccess p,.kkzEFq_challenge p,.kkzEFq_pending p{color:var(--dsw-alias-label-secondary);margin:4px 0 0;font-size:13px}.kkzEFq_toggle{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3,#7f8287b8);background:var(--dsw-alias-button-primary-dimmed,#7f82876b);cursor:pointer;border-radius:999px;width:44px;height:24px;padding:1px}.kkzEFq_toggle span{background:var(--dsw-static-neutral-bluish-00,#fff);border-radius:50%;width:20px;height:20px;transition:transform .16s;display:block}.kkzEFq_toggle:focus-visible{outline:2px solid var(--dsw-alias-button-info-fill,#4176e6);outline-offset:2px}.kkzEFq_toggle:disabled{cursor:not-allowed;opacity:.55}.kkzEFq_toggle[aria-checked=true]{border-color:var(--dsw-alias-button-info-fill,#4176e6);background:var(--dsw-alias-button-info-fill,#4176e6)}.kkzEFq_toggle[aria-checked=true] span{transform:translate(20px)}.kkzEFq_challenge{grid-template-columns:148px 1fr;align-items:start;gap:16px;display:grid}.kkzEFq_challenge>button{grid-column:2;justify-self:start}.kkzEFq_challenge code{overflow-wrap:anywhere;max-height:72px;margin-top:8px;font-size:11px;display:block;overflow:auto}.kkzEFq_qr{margin:0}.kkzEFq_qr svg{fill:#111;background:#fff;border-radius:12px;width:148px;height:148px;padding:8px;display:block}.kkzEFq_qr code{clip:rect(0 0 0 0);width:1px;height:1px;position:absolute;overflow:hidden}.kkzEFq_pending{background:var(--dsw-alias-bg-module-platform);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:12px;gap:10px;padding:16px;display:grid}.kkzEFq_pending output{letter-spacing:.04em;font-size:18px;font-weight:700}.kkzEFq_actions{gap:8px;display:flex}.kkzEFq_device{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:14px;grid-template-columns:minmax(0,1fr) auto;gap:14px 20px;padding:16px;display:grid}.kkzEFq_deviceIdentity{align-content:center;gap:8px;min-width:0;display:grid}.kkzEFq_deviceIdentity strong{overflow-wrap:anywhere;font-size:15px;line-height:1.35}.kkzEFq_deviceBadges{flex-wrap:wrap;gap:6px;display:flex}.kkzEFq_deviceBadges span{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base);border-radius:999px;padding:3px 8px;font-size:11px;line-height:1.3}.kkzEFq_connection:before{content:\"\";vertical-align:1px;background:currentColor;border-radius:50%;width:6px;height:6px;margin-right:5px;display:inline-block}.kkzEFq_connection[data-online=true]{border:1px solid var(--dsw-alias-state-success-primary);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-weight:650}.kkzEFq_connection[data-online=true]:before{background:var(--dsw-alias-state-success-primary)}.kkzEFq_deviceAction{white-space:nowrap;align-self:center}.kkzEFq_deviceMetadata{border-top:1px solid var(--dsw-alias-border-l2);grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0;padding-top:12px;display:grid}.kkzEFq_deviceMetadata div{min-width:0}.kkzEFq_deviceMetadata dt{color:var(--dsw-alias-label-secondary);font-size:11px}.kkzEFq_deviceMetadata dd{overflow-wrap:anywhere;margin:3px 0 0;font-size:12px;line-height:1.45}@media (width<=480px){.kkzEFq_device{grid-template-columns:1fr}.kkzEFq_deviceAction{justify-self:start}.kkzEFq_deviceMetadata{grid-column:1;grid-template-columns:1fr}}.kkzEFq_header h2,.kkzEFq_header p{margin:0}.kkzEFq_header h2{font-size:17px}.kkzEFq_header p{color:var(--dsw-alias-label-secondary);margin-top:2px;font-size:13px}.kkzEFq_notice{gap:14px;display:grid}.kkzEFq_notice p,.kkzEFq_signedIn p,.kkzEFq_waiting p{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;line-height:1.65}.kkzEFq_noticeHeader{align-items:center;gap:8px;display:flex}.kkzEFq_noticeHeader span{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-secondary);letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:700}.kkzEFq_consent{align-items:flex-start;gap:9px;font-size:13px;line-height:1.5;display:flex}.kkzEFq_consent input{margin-top:3px}.kkzEFq_error{color:var(--dsw-alias-state-error-primary)!important}.kkzEFq_waiting{text-align:center;justify-items:center;gap:10px;padding:30px 16px;display:grid}.kkzEFq_spinner{border:3px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-button-info-fill);border-radius:50%;width:28px;height:28px;animation:.8s linear infinite kkzEFq_spin}.kkzEFq_signedIn{grid-template-columns:auto 1fr auto;align-items:center;gap:14px;display:grid}.kkzEFq_profileAvatar{border-radius:14px;width:48px;height:48px}@keyframes kkzEFq_spin{to{transform:rotate(360deg)}}";
		const tagId$6 = "@deepseek-ai/dsh-client-ui-desktop/AccountControl.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$6) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-desktop";
			tag.dataset.pluginCss = tagId$6;
			tag.textContent = css$6;
			document.head.appendChild(tag);
		}
		var AccountControl_module_css_default = {
			"actions": "kkzEFq_actions",
			"challenge": "kkzEFq_challenge",
			"connection": "kkzEFq_connection",
			"consent": "kkzEFq_consent",
			"device": "kkzEFq_device",
			"deviceAction": "kkzEFq_deviceAction",
			"deviceBadges": "kkzEFq_deviceBadges",
			"deviceIdentity": "kkzEFq_deviceIdentity",
			"deviceMetadata": "kkzEFq_deviceMetadata",
			"error": "kkzEFq_error",
			"header": "kkzEFq_header",
			"mark": "kkzEFq_mark",
			"mobileAccess": "kkzEFq_mobileAccess",
			"notice": "kkzEFq_notice",
			"noticeHeader": "kkzEFq_noticeHeader",
			"pairing": "kkzEFq_pairing",
			"pending": "kkzEFq_pending",
			"profileAvatar": "kkzEFq_profileAvatar",
			"qr": "kkzEFq_qr",
			"root": "kkzEFq_root",
			"signedIn": "kkzEFq_signedIn",
			"spin": "kkzEFq_spin",
			"spinner": "kkzEFq_spinner",
			"toggle": "kkzEFq_toggle",
			"waiting": "kkzEFq_waiting"
		};
		//#endregion
		//#region src/client/AccountControl.tsx
		/** Desktop Mobile Pairing Settings section and bilingual pre-authorization notice. */
		/** Render Account state inside the Desktop-only Mobile Pairing Settings section. */
		function AccountControl({ t, useAccount, usePairing }) {
			const snapshot = useAccount((value) => value);
			const pairing = usePairing((value) => value);
			const desktop = window.dshDesktop;
			if (desktop === void 0) return null;
			const signedIn = (snapshot.status === "signed-in" || snapshot.status === "signing-out") && snapshot.account !== void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: AccountControl_module_css_default.root,
				"data-desktop-account-control": snapshot.status,
				children: [
					!signedIn && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: AccountControl_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: AccountControl_module_css_default.mark,
							children: "G"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("account.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("account.sectionDescription") })] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountPanel, {
						desktop,
						snapshot,
						t
					}),
					(snapshot.status === "signed-in" || snapshot.status === "signing-out") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PairingPanel, {
						desktop,
						snapshot: pairing,
						t
					})
				]
			});
		}
		function PairingPanel({ desktop, snapshot, t }) {
			const pending = snapshot.pending;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: AccountControl_module_css_default.pairing,
				"data-desktop-pairing": snapshot.status,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AccountControl_module_css_default.mobileAccess,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("pairing.mobileAccess") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("pairing.mobileAccessDescription") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "switch",
							"aria-label": t("pairing.mobileAccess"),
							"aria-checked": snapshot.enabled,
							className: AccountControl_module_css_default.toggle,
							disabled: snapshot.status === "unavailable",
							onClick: () => {
								desktop.pairingSetEnabled(!snapshot.enabled);
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
						})]
					}),
					snapshot.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: AccountControl_module_css_default.error,
						role: "alert",
						children: snapshot.error
					}),
					snapshot.enabled && snapshot.status === "ready" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						onClick: () => {
							desktop.pairingCreateChallenge();
						},
						children: t("pairing.createChallenge")
					}),
					snapshot.challenge !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AccountControl_module_css_default.challenge,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PairingQr, {
								label: t("pairing.qrLabel"),
								value: snapshot.challenge.qrPayload
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("pairing.scan") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("pairing.fullLink") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: snapshot.challenge.oneTimeLink })
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: () => {
									desktop.pairingCancelChallenge();
								},
								children: t("pairing.cancel")
							})
						]
					}),
					pending !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AccountControl_module_css_default.pending,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("pairing.compareWords") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: pending.deviceName }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("output", { children: pending.authenticationWords.join(" ") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: AccountControl_module_css_default.actions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									onClick: () => {
										desktop.pairingConfirm(pending.id);
									},
									children: t("pairing.confirm")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									onClick: () => {
										desktop.pairingReject(pending.id);
									},
									children: t("pairing.reject")
								})]
							})
						]
					}),
					snapshot.pairings.map((pairing) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AccountControl_module_css_default.device,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: AccountControl_module_css_default.deviceIdentity,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: pairing.deviceName }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: AccountControl_module_css_default.deviceBadges,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: pairing.platform }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: AccountControl_module_css_default.connection,
										"data-online": pairing.online,
										children: pairing.online ? t("pairing.online") : t("pairing.offline")
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: AccountControl_module_css_default.deviceAction,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									onClick: () => {
										desktop.pairingRevoke(pairing.id);
									},
									children: t("pairing.revoke")
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
								className: AccountControl_module_css_default.deviceMetadata,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("pairing.paired") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
									dateTime: new Date(pairing.pairedAt).toISOString(),
									children: new Date(pairing.pairedAt).toLocaleString()
								}) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("pairing.lastAccess") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
									dateTime: new Date(pairing.lastAccessAt).toISOString(),
									children: new Date(pairing.lastAccessAt).toLocaleString()
								}) })] })]
							})
						]
					}, pairing.id))
				]
			});
		}
		function PairingQr({ label, value }) {
			const qr = encode(value, { ecc: "M" });
			let path = "";
			for (let row = 0; row < qr.size; row += 1) for (let column = 0; column < qr.size; column += 1) if (qr.data[row]?.[column] === true) path += `M${String(column)} ${String(row)}h1v1h-1z`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("figure", {
				className: AccountControl_module_css_default.qr,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
					viewBox: `-2 -2 ${String(qr.size + 4)} ${String(qr.size + 4)}`,
					"aria-label": label,
					role: "img",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: path })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
					"aria-label": "Pairing QR payload",
					children: value
				})]
			});
		}
		function AccountPanel({ desktop, snapshot, t }) {
			if (snapshot.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: AccountControl_module_css_default.error,
				children: snapshot.error ?? t("account.unavailable")
			});
			if ((snapshot.status === "signed-in" || snapshot.status === "signing-out") && snapshot.account !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: AccountControl_module_css_default.signedIn,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						className: AccountControl_module_css_default.profileAvatar,
						src: snapshot.account.avatarUrl,
						alt: ""
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: snapshot.account.githubLogin }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("account.signedInDescription") })] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						disabled: snapshot.status === "signing-out",
						onClick: () => {
							desktop.accountSignOut();
						},
						children: t("account.signOut")
					})
				]
			});
			if (snapshot.status === "polling" || snapshot.status === "authorizing") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: AccountControl_module_css_default.waiting,
				"aria-live": "polite",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: AccountControl_module_css_default.spinner }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("account.finishBrowser") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("account.polling") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						onClick: () => {
							desktop.accountCancelLogin();
						},
						children: t("account.cancelLogin")
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: AccountControl_module_css_default.notice,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AccountControl_module_css_default.noticeHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("account.privacyBadge") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("account.noticeTitle") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						lang: "zh-CN",
						children: ACCOUNT_PRIVACY_NOTICE.zh
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						lang: "en",
						children: ACCOUNT_PRIVACY_NOTICE.en
					}),
					snapshot.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: AccountControl_module_css_default.error,
						children: snapshot.error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: AccountControl_module_css_default.consent,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: snapshot.privacyAccepted,
							onChange: () => {
								desktop.accountAcceptPrivacy();
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("account.consent") })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						disabled: !snapshot.privacyAccepted,
						onClick: () => {
							desktop.accountBeginLogin();
						},
						children: t("account.continueGitHub")
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/yishu.cy/IdeaProjects/deepseek-harness/packages/client/ui-desktop/src/client/Sub2ApiControl.module.css.mjs
		const css$5 = ".fRGjzG_root{gap:20px;width:100%;display:grid}.fRGjzG_header{justify-content:space-between;align-items:flex-start;gap:24px;display:flex}.fRGjzG_headerCopy{max-width:640px}.fRGjzG_runningControls{justify-items:end;gap:10px;display:grid}.fRGjzG_header p{color:var(--dsw-alias-label-secondary);margin:4px 0 0;font-size:13px}.fRGjzG_body{border-top:1px solid var(--dsw-alias-border-l2);gap:18px;padding-top:18px;display:grid}.fRGjzG_consoleFrame{background:0 0;border:0;width:100%;min-height:720px;display:block}.fRGjzG_stack{justify-items:start;gap:12px;display:grid}.fRGjzG_stack p{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px}.fRGjzG_actions{flex-wrap:wrap;gap:8px;display:flex}.fRGjzG_uninstallConfirm{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;flex-wrap:wrap;gap:8px;padding:10px 12px;display:flex}.fRGjzG_error{color:var(--dsw-alias-state-error-primary);font-size:13px}.fRGjzG_spinner{border:2px solid var(--dsw-alias-border-l3,#7f8287b8);border-top-color:#0000;border-radius:999px;width:16px;height:16px;animation:.9s linear infinite fRGjzG_sub2api-spin}@keyframes fRGjzG_sub2api-spin{to{transform:rotate(360deg)}}";
		const tagId$5 = "@deepseek-ai/dsh-client-ui-desktop/Sub2ApiControl.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$5) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-desktop";
			tag.dataset.pluginCss = tagId$5;
			tag.textContent = css$5;
			document.head.appendChild(tag);
		}
		var Sub2ApiControl_module_css_default = {
			"actions": "fRGjzG_actions",
			"body": "fRGjzG_body",
			"consoleFrame": "fRGjzG_consoleFrame",
			"error": "fRGjzG_error",
			"header": "fRGjzG_header",
			"headerCopy": "fRGjzG_headerCopy",
			"root": "fRGjzG_root",
			"runningControls": "fRGjzG_runningControls",
			"spinner": "fRGjzG_spinner",
			"stack": "fRGjzG_stack",
			"sub2api-spin": "fRGjzG_sub2api-spin",
			"uninstallConfirm": "fRGjzG_uninstallConfirm"
		};
		//#endregion
		//#region src/client/Sub2ApiControl.tsx
		/** Desktop-only Sub2API offer card in Settings: render-only, Host pushes state. */
		/** Render the offer card from the Host-pushed snapshot; no local state machine. */
		function Sub2ApiControl({ t, useSub2api }) {
			const snapshot = useSub2api((value) => value);
			const consoleUrl = useSub2ApiConsoleUrl();
			const frame = useAutoSizedConsoleFrame();
			const desktop = window.dshDesktop;
			if (desktop === void 0) return null;
			const running = snapshot.state === "running";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: Sub2ApiControl_module_css_default.root,
				"data-desktop-sub2api-state": snapshot.state,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: Sub2ApiControl_module_css_default.header,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Sub2ApiControl_module_css_default.headerCopy,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("sub2api.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("sub2api.offerBody") })]
					}), running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OfferPanel, {
						desktop,
						snapshot,
						t
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Sub2ApiControl_module_css_default.body,
					"data-desktop-sub2api-enabled": snapshot.enabled,
					children: [!running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OfferPanel, {
						desktop,
						snapshot,
						t
					}), running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
						ref: frame.ref,
						className: Sub2ApiControl_module_css_default.consoleFrame,
						src: consoleUrl,
						style: { height: `${String(frame.height)}px` },
						title: t("sub2api.consoleTitle"),
						onLoad: frame.connect
					})]
				})]
			});
		}
		const DEFAULT_CONSOLE_HEIGHT = 720;
		/** Grow the same-origin native workspace so the surrounding Settings page owns vertical scrolling. */
		function useAutoSizedConsoleFrame() {
			const ref = (0, react.useRef)(null);
			const observer = (0, react.useRef)(void 0);
			const [height, setHeight] = (0, react.useState)(DEFAULT_CONSOLE_HEIGHT);
			const measure = (0, react.useCallback)(() => {
				const content = ref.current?.contentDocument;
				if (content === void 0 || content === null) return;
				setHeight(Math.max(DEFAULT_CONSOLE_HEIGHT, content.documentElement.scrollHeight, content.body.scrollHeight));
			}, []);
			const connect = (0, react.useCallback)(() => {
				observer.current?.disconnect();
				const content = ref.current?.contentDocument;
				if (content === void 0 || content === null) return;
				const nextObserver = new ResizeObserver(measure);
				nextObserver.observe(content.documentElement);
				nextObserver.observe(content.body);
				observer.current = nextObserver;
				measure();
			}, [measure]);
			(0, react.useEffect)(() => () => {
				observer.current?.disconnect();
			}, []);
			return {
				ref,
				height,
				connect
			};
		}
		function sub2ApiConsoleUrl() {
			const presented = document.documentElement.style.colorScheme;
			const media = typeof matchMedia === "undefined" ? void 0 : matchMedia("(prefers-color-scheme: dark)");
			return `/plugins/dsh-sub2api/ui/admin/accounts?embed=desktop&theme=${presented === "dark" || presented === "light" ? presented : media?.matches === true ? "dark" : "light"}&lang=${document.documentElement.lang.toLowerCase().startsWith("zh") ? "zh" : "en"}`;
		}
		/** Reload the embedded native workspace when Desktop theme or locale changes. */
		function useSub2ApiConsoleUrl() {
			const [url, setUrl] = (0, react.useState)(sub2ApiConsoleUrl);
			(0, react.useEffect)(() => {
				const sync = () => {
					const next = sub2ApiConsoleUrl();
					setUrl((current) => current === next ? current : next);
				};
				const observer = new MutationObserver(sync);
				observer.observe(document.documentElement, {
					attributes: true,
					attributeFilter: ["style", "lang"]
				});
				const media = typeof matchMedia === "undefined" ? void 0 : matchMedia("(prefers-color-scheme: dark)");
				media?.addEventListener("change", sync);
				return () => {
					observer.disconnect();
					media?.removeEventListener("change", sync);
				};
			}, []);
			return url;
		}
		/** The per-phase body: one status line plus the actions that phase allows. */
		function OfferPanel({ desktop, snapshot, t }) {
			const [confirmingUninstall, setConfirmingUninstall] = (0, react.useState)(false);
			const uninstallRow = confirmingUninstall && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Sub2ApiControl_module_css_default.uninstallConfirm,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						onClick: () => {
							desktop.sub2ApiUninstall(false);
						},
						children: t("sub2api.uninstallKeep")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						onClick: () => {
							desktop.sub2ApiUninstall(true);
						},
						children: t("sub2api.uninstallDelete")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "ghost",
						onClick: () => {
							setConfirmingUninstall(false);
						},
						children: t("sub2api.cancel")
					})
				]
			});
			switch (snapshot.state) {
				case "missing": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Sub2ApiControl_module_css_default.stack,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sub2api.offerTitle") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("sub2api.downloadNote") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("sub2api.dataNote") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							onClick: () => {
								desktop.sub2ApiEnable();
							},
							children: t("sub2api.download")
						})
					]
				});
				case "downloading": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Sub2ApiControl_module_css_default.stack,
					"aria-live": "polite",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: Sub2ApiControl_module_css_default.spinner }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						"aria-live": "polite",
						children: snapshot.downloadPercent === void 0 ? t("sub2api.downloadingIndeterminate") : t("sub2api.downloading").replace("{percent}", String(snapshot.downloadPercent))
					})]
				});
				case "verifying": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Sub2ApiControl_module_css_default.stack,
					"aria-live": "polite",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: Sub2ApiControl_module_css_default.spinner }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sub2api.verifying") })]
				});
				case "installed": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Sub2ApiControl_module_css_default.stack,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [t("sub2api.installed"), snapshot.version === void 0 ? "" : ` · ${snapshot.version}`] }),
						!snapshot.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("sub2api.disabled") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Sub2ApiControl_module_css_default.actions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								onClick: () => {
									desktop.sub2ApiEnable();
								},
								children: t("sub2api.enable")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: () => {
									setConfirmingUninstall(true);
								},
								children: t("sub2api.uninstall")
							})]
						})] }),
						uninstallRow
					]
				});
				case "starting": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Sub2ApiControl_module_css_default.stack,
					"aria-live": "polite",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: Sub2ApiControl_module_css_default.spinner }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("sub2api.starting") })]
				});
				case "running": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Sub2ApiControl_module_css_default.runningControls,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [t("sub2api.running"), snapshot.version === void 0 ? "" : ` · ${snapshot.version}`] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Sub2ApiControl_module_css_default.actions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: () => {
									desktop.sub2ApiDisable();
								},
								children: t("sub2api.disable")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "ghost",
								onClick: () => {
									setConfirmingUninstall(true);
								},
								children: t("sub2api.uninstall")
							})]
						}),
						uninstallRow
					]
				});
				case "error": return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Sub2ApiControl_module_css_default.stack,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: Sub2ApiControl_module_css_default.error,
							role: "alert",
							children: snapshot.error
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Sub2ApiControl_module_css_default.actions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								onClick: () => {
									desktop.sub2ApiEnable();
								},
								children: t("sub2api.retry")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: () => {
									setConfirmingUninstall(true);
								},
								children: t("sub2api.uninstall")
							})]
						}),
						uninstallRow
					]
				});
			}
		}
		//#endregion
		//#region src/client/prototype/mock-data.ts
		const MOCK_ACCOUNTS = [
			{
				id: "antigravity-1",
				filename: "antigravity-dev-alpha@example.com.json",
				provider: "antigravity",
				label: "Antigravity Pro Alpha",
				accountEmail: "dev-alpha@example.com",
				tier: "Pro",
				status: "error",
				statusMessage: "额度获取失败: auth token refresh failed",
				successCount: 0,
				failCount: 0,
				healthHistory: [],
				createdAt: "2026/9/5 23:53:29",
				metrics: []
			},
			{
				id: "antigravity-2",
				filename: "antigravity-workspace-team@example.com.json",
				provider: "antigravity",
				label: "Antigravity Workspace",
				accountEmail: "workspace-team@example.com",
				tier: "Pro",
				status: "active",
				successCount: 2270,
				failCount: 5,
				healthHistory: [
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					false,
					true,
					true
				],
				createdAt: "2026/9/10 01:26:35",
				metrics: [
					{
						key: "gemini-5h",
						name: "Five Hour Limit Remaining",
						percentRemaining: 93,
						timeRemainingPercent: 46,
						windowLabel: "5h",
						resetText: "剩余 93% · 2 小时 17 分钟 后刷新",
						isReliable: true
					},
					{
						key: "gemini-weekly",
						name: "Weekly Limit Remaining",
						percentRemaining: 59,
						timeRemainingPercent: 20,
						windowLabel: "周限额",
						resetText: "剩余 59% · 1 天 9 小时 后刷新",
						isReliable: true
					},
					{
						key: "claude-5h",
						name: "Claude 和 GPT 模型 5h 限额",
						percentRemaining: 100,
						timeRemainingPercent: 95,
						windowLabel: "5h",
						resetText: "额度可用 · 4 小时 47 分钟 后刷新",
						isReliable: true
					},
					{
						key: "claude-weekly",
						name: "Claude 和 GPT 模型 周限额",
						percentRemaining: 100,
						timeRemainingPercent: 98,
						windowLabel: "周限额",
						resetText: "额度可用 · 6 天 23 小时 后刷新",
						isReliable: true
					}
				]
			},
			{
				id: "codex-1",
				filename: "codex-pool-engine@example.com-pro.json",
				provider: "codex",
				label: "Codex 20x Dev Pool",
				accountEmail: "pool-engine@example.com",
				tier: "Pro 20x",
				status: "active",
				successCount: 7217,
				failCount: 54,
				healthHistory: [
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					false
				],
				createdAt: "2026/9/10 01:10:41",
				metrics: [
					{
						key: "weekly",
						name: "周限额",
						percentRemaining: 77,
						timeRemainingPercent: 71,
						windowLabel: "周限额",
						resetText: "77% · 09/15 02:32 · 5天后",
						isReliable: true
					},
					{
						key: "spark-5h",
						name: "GPT-5.3-Codex-Spark 5h",
						percentRemaining: 100,
						timeRemainingPercent: 80,
						windowLabel: "5h",
						resetText: "100% · 09/10 06:25 · 4小时后",
						isReliable: true
					},
					{
						key: "spark-7d",
						name: "GPT-5.3-Codex-Spark 周限额",
						percentRemaining: 100,
						timeRemainingPercent: 85,
						windowLabel: "周限额",
						resetText: "100% · 09/17 01:25 · 6天后",
						isReliable: true
					},
					{
						key: "reserve-7d",
						name: "gpt-reserve 周限额",
						percentRemaining: 100,
						timeRemainingPercent: 85,
						windowLabel: "周限额",
						resetText: "100% · 09/17 01:25 · 6天后",
						isReliable: true
					}
				]
			},
			{
				id: "kimi-1",
				filename: "kimi-research-seat@example.com.json",
				provider: "kimi",
				label: "Kimi Research Account",
				accountEmail: "research-seat@example.com",
				tier: "Standard",
				status: "active",
				successCount: 1443,
				failCount: 11,
				healthHistory: [
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true
				],
				createdAt: "2026/9/10 02:17:00",
				metrics: [{
					key: "5h-window",
					name: "5h 限额 (已探测)",
					percentRemaining: 100,
					timeRemainingPercent: 40,
					windowLabel: "5h",
					resetText: "100% · 09/10 02:17",
					isReliable: true
				}]
			},
			{
				id: "xai-1",
				filename: "xai-grok-sub@example.com.json",
				provider: "xai",
				label: "xAI Grok Subscription",
				accountEmail: "grok-sub@example.com",
				tier: "Premium",
				status: "warning",
				statusMessage: "周限额已用完，等待窗口刷新",
				successCount: 8225,
				failCount: 116,
				healthHistory: [
					true,
					true,
					true,
					true,
					true,
					false,
					true,
					true,
					true,
					true
				],
				createdAt: "2026/9/9 23:04:03",
				metrics: [{
					key: "xai-weekly",
					name: "周限额 (月度账单探测)",
					percentRemaining: 0,
					timeRemainingPercent: 9,
					windowLabel: "周限额",
					resetText: "已用 100% · 重置 09/10 15:00 · 13小时后",
					isReliable: true,
					isExceeded: true
				}]
			},
			{
				id: "anthropic-1",
				filename: "anthropic-workstation@example.com.json",
				provider: "anthropic",
				label: "Claude Team Workstation",
				accountEmail: "workstation@example.com",
				tier: "Team",
				status: "active",
				successCount: 3105,
				failCount: 2,
				healthHistory: [
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true
				],
				createdAt: "2026/9/8 14:20:11",
				metrics: [{
					key: "claude-sonnet",
					name: "Claude 3.5 Sonnet / Opus 窗口 (被动响应头)",
					percentRemaining: 68,
					timeRemainingPercent: 55,
					windowLabel: "5h 窗口",
					resetText: "剩余 68% · 2 小时 45 分钟后刷新",
					isReliable: true
				}]
			},
			{
				id: "glm-1",
				filename: "glm-coding-plan@example.com.json",
				provider: "glm",
				label: "GLM Coding Plan (CN个人订阅)",
				accountEmail: "coding-plan@example.com",
				tier: "Coding Plan (CN)",
				status: "active",
				successCount: 450,
				failCount: 0,
				healthHistory: [
					true,
					true,
					true,
					true,
					true,
					true,
					true,
					true
				],
				createdAt: "2026/9/10 03:00:00",
				metrics: [{
					key: "glm-5h",
					name: "GLM Coding 5h 限额 (已用 16%)",
					percentRemaining: 84,
					timeRemainingPercent: 54,
					windowLabel: "5h 窗口",
					resetText: "剩余 84% (已用 16%) · 2 小时 42 分钟后重置",
					isReliable: true
				}, {
					key: "glm-weekly",
					name: "GLM Coding 周限额 (已用 35%)",
					percentRemaining: 65,
					timeRemainingPercent: 71,
					windowLabel: "周限额",
					resetText: "剩余 65% (已用 35%) · 5 天后重置",
					isReliable: true
				}]
			}
		];
		//#endregion
		//#region \0dsh-css:/Users/yishu.cy/IdeaProjects/deepseek-harness/packages/client/ui-desktop/src/client/prototype/QuotaBarWithTimeline.module.css.mjs
		const css$4 = ".WrnBJq_container{flex-direction:column;gap:6px;width:100%;display:flex}.WrnBJq_labelRow{justify-content:space-between;align-items:baseline;font-size:12px;display:flex}.WrnBJq_nameGroup{align-items:center;gap:6px;max-width:60%;display:flex}.WrnBJq_metricName{color:var(--dsw-alias-label-primary,#1e293b);text-overflow:ellipsis;white-space:nowrap;font-weight:500;overflow:hidden}.WrnBJq_windowBadge{background:var(--dsw-alias-interactive-bg-subtle,#0000000f);color:var(--dsw-alias-label-secondary,#64748b);border-radius:4px;padding:1px 4px;font-size:10px}.WrnBJq_metaGroup{align-items:center;gap:8px;font-size:11px;display:flex}.WrnBJq_percentText{font-feature-settings:\"tnum\";font-weight:700}.WrnBJq_resetTime{color:var(--dsw-alias-label-secondary,#64748b);font-size:11px}.WrnBJq_track{background:var(--dsw-alias-interactive-bg-subtle,#00000014);border-radius:4px;width:100%;height:8px;position:relative;overflow:visible}.WrnBJq_quotaFill{border-radius:4px;height:100%;transition:width .3s,background-color .3s}.WrnBJq_timelineMarker{pointer-events:none;z-index:2;width:2px;position:absolute;top:-6px;bottom:-6px;transform:translate(-50%)}.WrnBJq_needleArrow{border-left:4px solid #0000;border-right:4px solid #0000;border-top:5px solid var(--dsw-alias-label-primary,#e11d48);width:0;height:0;position:absolute;top:0;left:50%;transform:translate(-50%)}.WrnBJq_needleLine{background:var(--dsw-alias-label-primary,#e11d48);width:2px;position:absolute;top:4px;bottom:0;left:0;box-shadow:0 0 2px #0000004d}.WrnBJq_timelineBand{pointer-events:none;background:#0284c726;border-right:2px dashed #0284c7;border-radius:4px 0 0 4px;position:absolute;top:0;bottom:0;left:0}.WrnBJq_legendRow{color:var(--dsw-alias-label-tertiary,#94a3b8);align-items:center;gap:12px;margin-top:1px;font-size:10px;display:flex}.WrnBJq_legendItem{align-items:center;gap:4px;display:flex}.WrnBJq_quotaDot{border-radius:999px;width:6px;height:6px}.WrnBJq_timeDot{background:#e11d48;border-radius:999px;width:6px;height:6px}";
		const tagId$4 = "@deepseek-ai/dsh-client-ui-desktop/QuotaBarWithTimeline.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-desktop";
			tag.dataset.pluginCss = tagId$4;
			tag.textContent = css$4;
			document.head.appendChild(tag);
		}
		var QuotaBarWithTimeline_module_css_default = {
			"container": "WrnBJq_container",
			"labelRow": "WrnBJq_labelRow",
			"legendItem": "WrnBJq_legendItem",
			"legendRow": "WrnBJq_legendRow",
			"metaGroup": "WrnBJq_metaGroup",
			"metricName": "WrnBJq_metricName",
			"nameGroup": "WrnBJq_nameGroup",
			"needleArrow": "WrnBJq_needleArrow",
			"needleLine": "WrnBJq_needleLine",
			"percentText": "WrnBJq_percentText",
			"quotaDot": "WrnBJq_quotaDot",
			"quotaFill": "WrnBJq_quotaFill",
			"resetTime": "WrnBJq_resetTime",
			"timeDot": "WrnBJq_timeDot",
			"timelineBand": "WrnBJq_timelineBand",
			"timelineMarker": "WrnBJq_timelineMarker",
			"track": "WrnBJq_track",
			"windowBadge": "WrnBJq_windowBadge"
		};
		//#endregion
		//#region src/client/prototype/QuotaBarWithTimeline.tsx
		/**
		* QuotaBarWithTimeline:
		* Dual-track visual comparison matching User Screenshot 3 & 4 and Manager QuotaTimeline logic.
		* Tracks quota remaining % and overlays a time remaining % marker/range.
		*/
		function QuotaBarWithTimeline({ percentRemaining, timeRemainingPercent, name, windowLabel, resetText, isReliable, isExceeded, styleVariant = "needle" }) {
			const boundedQuota = Math.max(0, Math.min(100, percentRemaining));
			const boundedTime = timeRemainingPercent !== void 0 ? Math.max(0, Math.min(100, timeRemainingPercent)) : void 0;
			const quotaColor = isExceeded || boundedQuota === 0 ? "var(--dsw-alias-state-error-primary, #ef4444)" : boundedQuota < 30 ? "var(--dsw-alias-state-error-primary, #ef4444)" : boundedQuota < 70 ? "var(--dsw-alias-state-warning-primary, #f59e0b)" : "var(--dsw-alias-state-success-primary, #10b981)";
			const showQuotaFill = isReliable;
			const showTime = isReliable && boundedTime !== void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: QuotaBarWithTimeline_module_css_default.container,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: QuotaBarWithTimeline_module_css_default.labelRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: QuotaBarWithTimeline_module_css_default.nameGroup,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: QuotaBarWithTimeline_module_css_default.metricName,
								title: name,
								children: name
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: QuotaBarWithTimeline_module_css_default.windowBadge,
								children: windowLabel
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: QuotaBarWithTimeline_module_css_default.metaGroup,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: QuotaBarWithTimeline_module_css_default.percentText,
								style: { color: isReliable ? quotaColor : "var(--dsw-alias-label-tertiary, #94a3b8)" },
								children: isReliable ? `${boundedQuota}%` : "未知"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: QuotaBarWithTimeline_module_css_default.resetTime,
								children: resetText
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: QuotaBarWithTimeline_module_css_default.track,
						children: [
							showQuotaFill && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: QuotaBarWithTimeline_module_css_default.quotaFill,
								style: {
									width: `${String(boundedQuota)}%`,
									backgroundColor: quotaColor
								}
							}),
							showTime && boundedTime !== void 0 && styleVariant === "needle" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: QuotaBarWithTimeline_module_css_default.timelineMarker,
								style: { left: `${String(boundedTime)}%` },
								title: `时间窗口剩余: ${String(boundedTime)}%`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: QuotaBarWithTimeline_module_css_default.needleArrow }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: QuotaBarWithTimeline_module_css_default.needleLine })]
							}),
							showTime && boundedTime !== void 0 && styleVariant === "band" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: QuotaBarWithTimeline_module_css_default.timelineBand,
								style: { width: `${String(boundedTime)}%` },
								title: `时间窗口剩余: ${String(boundedTime)}%`
							})
						]
					}),
					showTime && boundedTime !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: QuotaBarWithTimeline_module_css_default.legendRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: QuotaBarWithTimeline_module_css_default.legendItem,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: QuotaBarWithTimeline_module_css_default.quotaDot,
									style: { backgroundColor: quotaColor }
								}),
								"额度剩余 ",
								boundedQuota,
								"%"
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: QuotaBarWithTimeline_module_css_default.legendItem,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: QuotaBarWithTimeline_module_css_default.timeDot }),
								"时间窗口剩余 ",
								boundedTime,
								"%"
							]
						})]
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/yishu.cy/IdeaProjects/deepseek-harness/packages/client/ui-desktop/src/client/prototype/AccountCard.module.css.mjs
		const css$3 = ".hHLABW_card{border:1px solid var(--dsw-alias-border-l2,#00000014);background:var(--dsw-alias-bg-layer-1,#fff);border-radius:14px;flex-direction:column;min-height:250px;padding:18px 20px;transition:all .2s;display:flex;box-shadow:0 2px 8px #0000000a}.hHLABW_card:hover{border-color:var(--dsw-alias-border-l3,#00000029);box-shadow:0 4px 16px #00000012}.hHLABW_cardDisabled{opacity:.65;filter:grayscale(.2)}.hHLABW_cardTop{border-bottom:1px solid var(--dsw-alias-border-l1,#0000000d);justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:12px;display:flex}.hHLABW_providerBadge{align-items:center;gap:10px;max-width:70%;display:flex}.hHLABW_providerIcon{background:var(--dsw-alias-interactive-bg-subtle,#0000000f);color:#10b981;border-radius:8px;flex-shrink:0;justify-content:center;align-items:center;width:28px;height:28px;font-size:13px;font-weight:700;display:flex}.hHLABW_titleBox{flex-direction:column;display:flex;overflow:hidden}.hHLABW_filename{color:var(--dsw-alias-label-primary,#0f172a);white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:600;overflow:hidden}.hHLABW_providerLabel{color:var(--dsw-alias-label-secondary,#64748b);font-size:11px}.hHLABW_topRightActions{flex-shrink:0;align-items:center;gap:8px;display:flex}.hHLABW_faceFlipBtn{border:1px solid var(--dsw-alias-border-l2,#0000001a);background:var(--dsw-alias-interactive-bg-subtle,transparent);color:var(--dsw-alias-label-secondary,#475569);cursor:pointer;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:500;transition:all .15s}.hHLABW_faceFlipBtn:hover{background:var(--dsw-alias-interactive-bg-hover,#0000000f);color:var(--dsw-alias-label-primary,#0f172a)}.hHLABW_statusBadge{border-radius:10px;padding:2px 7px;font-size:11px;font-weight:600}.hHLABW_status_active{color:#059669;background:#10b9811f}.hHLABW_status_warning{color:#d97706;background:#f59e0b26}.hHLABW_status_expired,.hHLABW_status_error{color:#dc2626;background:#ef44441f}.hHLABW_faceA{flex-direction:column;flex-grow:1;gap:14px;padding-top:14px;display:flex}.hHLABW_alertBanner{color:#b91c1c;background:#ef444414;border:1px solid #ef444433;border-radius:6px;padding:8px 12px;font-size:12px}.hHLABW_statsRow{grid-template-columns:1fr 1fr;gap:12px;display:grid}.hHLABW_statCol{flex-direction:column;gap:2px;display:flex}.hHLABW_statLabel{color:var(--dsw-alias-label-tertiary,#94a3b8);font-size:11px}.hHLABW_statValue{color:var(--dsw-alias-label-primary,#1e293b);text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.hHLABW_reqCount{gap:8px;font-size:11px;display:flex}.hHLABW_successNum{color:#10b981}.hHLABW_failNum{color:#ef4444}.hHLABW_healthSection{flex-direction:column;gap:6px;display:flex}.hHLABW_healthHeader{color:var(--dsw-alias-label-secondary,#64748b);justify-content:space-between;font-size:11px;display:flex}.hHLABW_healthRate{color:#10b981;font-weight:600}.hHLABW_healthTicks{gap:3px;height:10px;display:flex}.hHLABW_tick{border-radius:2px;flex:1}.hHLABW_tickPass{background:#10b981}.hHLABW_tickFail{background:#ef4444}.hHLABW_tickEmpty{background:var(--dsw-alias-interactive-bg-subtle,#0000000f)}.hHLABW_metaFooter{border-top:1px solid var(--dsw-alias-border-l1,#0000000d);justify-content:space-between;align-items:center;margin-top:auto;padding-top:10px;display:flex}.hHLABW_dateText{color:var(--dsw-alias-label-tertiary,#94a3b8);font-size:11px}.hHLABW_footerActions{align-items:center;gap:8px;display:flex}.hHLABW_faceB{flex-direction:column;flex-grow:1;gap:16px;padding-top:14px;display:flex}.hHLABW_quotaList{flex-direction:column;gap:14px;display:flex}.hHLABW_emptyQuota{text-align:center;color:var(--dsw-alias-label-secondary,#64748b);flex-direction:column;justify-content:center;align-items:center;gap:10px;padding:24px 0;font-size:12px;display:flex}.hHLABW_quotaFooter{border-top:1px solid var(--dsw-alias-border-l1,#0000000d);justify-content:space-between;align-items:center;margin-top:auto;padding-top:10px;display:flex}.hHLABW_quotaHint{color:var(--dsw-alias-label-tertiary,#94a3b8);max-width:60%;font-size:11px}.hHLABW_switchLabel{width:32px;height:18px;display:inline-block;position:relative}.hHLABW_toggleInput{opacity:0;width:0;height:0}.hHLABW_toggleSlider{cursor:pointer;background-color:#cbd5e1;border-radius:999px;transition:all .2s;position:absolute;inset:0}.hHLABW_toggleSlider:before{content:\"\";background-color:#fff;border-radius:50%;width:14px;height:14px;transition:all .2s;position:absolute;bottom:2px;left:2px}.hHLABW_toggleInput:checked+.hHLABW_toggleSlider{background-color:#10b981}.hHLABW_toggleInput:checked+.hHLABW_toggleSlider:before{transform:translate(14px)}";
		const tagId$3 = "@deepseek-ai/dsh-client-ui-desktop/AccountCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-desktop";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var AccountCard_module_css_default = {
			"alertBanner": "hHLABW_alertBanner",
			"card": "hHLABW_card",
			"cardDisabled": "hHLABW_cardDisabled",
			"cardTop": "hHLABW_cardTop",
			"dateText": "hHLABW_dateText",
			"emptyQuota": "hHLABW_emptyQuota",
			"faceA": "hHLABW_faceA",
			"faceB": "hHLABW_faceB",
			"faceFlipBtn": "hHLABW_faceFlipBtn",
			"failNum": "hHLABW_failNum",
			"filename": "hHLABW_filename",
			"footerActions": "hHLABW_footerActions",
			"healthHeader": "hHLABW_healthHeader",
			"healthRate": "hHLABW_healthRate",
			"healthSection": "hHLABW_healthSection",
			"healthTicks": "hHLABW_healthTicks",
			"metaFooter": "hHLABW_metaFooter",
			"providerBadge": "hHLABW_providerBadge",
			"providerIcon": "hHLABW_providerIcon",
			"providerLabel": "hHLABW_providerLabel",
			"quotaFooter": "hHLABW_quotaFooter",
			"quotaHint": "hHLABW_quotaHint",
			"quotaList": "hHLABW_quotaList",
			"reqCount": "hHLABW_reqCount",
			"statCol": "hHLABW_statCol",
			"statLabel": "hHLABW_statLabel",
			"statValue": "hHLABW_statValue",
			"statsRow": "hHLABW_statsRow",
			"statusBadge": "hHLABW_statusBadge",
			"status_active": "hHLABW_status_active",
			"status_error": "hHLABW_status_error",
			"status_expired": "hHLABW_status_expired",
			"status_warning": "hHLABW_status_warning",
			"successNum": "hHLABW_successNum",
			"switchLabel": "hHLABW_switchLabel",
			"tick": "hHLABW_tick",
			"tickEmpty": "hHLABW_tickEmpty",
			"tickFail": "hHLABW_tickFail",
			"tickPass": "hHLABW_tickPass",
			"titleBox": "hHLABW_titleBox",
			"toggleInput": "hHLABW_toggleInput",
			"toggleSlider": "hHLABW_toggleSlider",
			"topRightActions": "hHLABW_topRightActions"
		};
		//#endregion
		//#region src/client/prototype/AccountCard.tsx
		/**
		* AccountCard:
		* High-fidelity representation of a credential item with A/B face flipping.
		*
		* Face state architecture (R2 rule):
		* - Maintains an internal state `localFaceOverride` which starts at null.
		* - When `localFaceOverride` is null, the card follows `globalFace` (A or B).
		* - Clicking the card's individual flip button toggles its own face into an explicit
		*   override (A or B), becoming independent of the parent until a global command resets it.
		* - When parent issues a new global command (detected via `globalCommandEpoch` or direct reset),
		*   card clears its local override to align with all cards.
		*/
		function AccountCard({ item, globalFace = "A", globalEpoch = 0, styleVariant = "needle", onToggleStatus, onRefreshQuota, onDelete }) {
			const [localOverride, setLocalOverride] = (0, react.useState)(null);
			const [enabled, setEnabled] = (0, react.useState)(item.status !== "expired" && item.status !== "error");
			(0, react.useEffect)(() => {
				setLocalOverride(null);
			}, [globalEpoch]);
			const currentFace = localOverride !== null ? localOverride : globalFace;
			const flipFace = () => {
				setLocalOverride(currentFace === "A" ? "B" : "A");
			};
			const handleToggle = () => {
				setEnabled(!enabled);
				onToggleStatus?.(item.id);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${AccountCard_module_css_default.card} ${!enabled ? AccountCard_module_css_default.cardDisabled : ""}`,
				"data-testid": `account-card-${item.id}`,
				"data-current-face": currentFace,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AccountCard_module_css_default.cardTop,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: AccountCard_module_css_default.providerBadge,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: AccountCard_module_css_default.providerIcon,
								children: getProviderGlyph(item.provider)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: AccountCard_module_css_default.titleBox,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									className: AccountCard_module_css_default.filename,
									title: item.filename,
									children: item.filename
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: AccountCard_module_css_default.providerLabel,
									children: [
										item.provider.toUpperCase(),
										" · ",
										item.tier
									]
								})]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: AccountCard_module_css_default.topRightActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: AccountCard_module_css_default.faceFlipBtn,
								onClick: flipFace,
								"data-testid": `card-flip-btn-${item.id}`,
								title: currentFace === "A" ? "切换到配额面 (B面)" : "切换到管理面 (A面)",
								children: currentFace === "A" ? "⇄ 额度面" : "⇄ 管理面"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `${AccountCard_module_css_default.statusBadge} ${AccountCard_module_css_default[`status_${item.status}`]}`,
								children: getStatusLabel(item.status)
							})]
						})]
					}),
					currentFace === "A" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AccountCard_module_css_default.faceA,
						"data-testid": "card-face-a",
						children: [
							item.statusMessage && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: AccountCard_module_css_default.alertBanner,
								children: item.statusMessage
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: AccountCard_module_css_default.statsRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: AccountCard_module_css_default.statCol,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: AccountCard_module_css_default.statLabel,
										children: "账号主体"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										className: AccountCard_module_css_default.statValue,
										children: item.accountEmail
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: AccountCard_module_css_default.statCol,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: AccountCard_module_css_default.statLabel,
										children: "调用统计"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: AccountCard_module_css_default.reqCount,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: AccountCard_module_css_default.successNum,
											children: ["成功 ", item.successCount]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: AccountCard_module_css_default.failNum,
											children: ["失败 ", item.failCount]
										})]
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: AccountCard_module_css_default.healthSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: AccountCard_module_css_default.healthHeader,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "健康状态历史 (最近20次调用)" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: AccountCard_module_css_default.healthRate,
										children: item.successCount + item.failCount > 0 ? `${String(Math.round(item.successCount / (item.successCount + item.failCount) * 100))}%` : "--"
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: AccountCard_module_css_default.healthTicks,
									children: Array.from({ length: 20 }).map((_, i) => {
										const tick = item.healthHistory[i];
										return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `${AccountCard_module_css_default.tick} ${tick === true ? AccountCard_module_css_default.tickPass : tick === false ? AccountCard_module_css_default.tickFail : AccountCard_module_css_default.tickEmpty}` }, i);
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: AccountCard_module_css_default.metaFooter,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: AccountCard_module_css_default.dateText,
									children: ["创建时间: ", item.createdAt]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: AccountCard_module_css_default.footerActions,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "outline",
											onClick: () => {
												onDelete?.(item.id);
											},
											children: "删除"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											size: "sm",
											variant: "ghost",
											onClick: flipFace,
											children: "查看配额"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: AccountCard_module_css_default.switchLabel,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: enabled,
												onChange: handleToggle,
												className: AccountCard_module_css_default.toggleInput
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: AccountCard_module_css_default.toggleSlider })]
										})
									]
								})]
							})
						]
					}),
					currentFace === "B" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: AccountCard_module_css_default.faceB,
						"data-testid": "card-face-b",
						children: [item.metrics.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: AccountCard_module_css_default.emptyQuota,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "暂未获取到该账号配额数据，或该提供商不提供主动额度查询。" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "primary",
								onClick: () => {
									onRefreshQuota?.(item.id);
								},
								children: "立即探测刷新"
							})]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: AccountCard_module_css_default.quotaList,
							children: item.metrics.map((m) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBarWithTimeline, {
								name: m.name,
								percentRemaining: m.percentRemaining,
								timeRemainingPercent: m.timeRemainingPercent,
								windowLabel: m.windowLabel,
								resetText: m.resetText,
								isReliable: m.isReliable,
								isExceeded: m.isExceeded,
								styleVariant
							}, m.key))
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: AccountCard_module_css_default.quotaFooter,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: AccountCard_module_css_default.quotaHint,
								children: "同轴对比：绿/黄条为额度剩余，红刻度为本周期剩余时间。"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: AccountCard_module_css_default.footerActions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "ghost",
									onClick: () => {
										onRefreshQuota?.(item.id);
									},
									children: "刷新额度"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									size: "sm",
									variant: "outline",
									onClick: flipFace,
									children: "返回管理"
								})]
							})]
						})]
					})
				]
			});
		}
		function getProviderGlyph(p) {
			switch (p) {
				case "kimi": return "K";
				case "codex": return "⚡";
				case "anthropic": return "✳";
				case "antigravity": return "▲";
				case "xai": return "Ø";
				case "glm": return "◈";
				default: return "●";
			}
		}
		function getStatusLabel(s) {
			switch (s) {
				case "active": return "启用";
				case "warning": return "警告";
				case "expired": return "过期";
				case "error": return "异常";
				default: return "未知";
			}
		}
		//#endregion
		//#region \0dsh-css:/Users/yishu.cy/IdeaProjects/deepseek-harness/packages/client/ui-desktop/src/client/prototype/LoginModal.module.css.mjs
		const css$2 = ".Yv7jna_backdrop{z-index:10000;background:var(--dsw-alias-bg-mask-1,#00000073);backdrop-filter:blur(4px);justify-content:center;align-items:center;padding:20px;display:flex;position:fixed;inset:0}.Yv7jna_dialog{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-inverted,#0000001a);border-radius:16px;flex-direction:column;width:min(640px,100%);display:flex;overflow:hidden;box-shadow:0 20px 48px #00000047}.Yv7jna_header{border-bottom:1px solid var(--dsw-alias-border-l2,#00000014);justify-content:space-between;align-items:flex-start;padding:20px 24px 16px;display:flex}.Yv7jna_headerTitle h3{color:var(--dsw-alias-label-primary,#0f172a);margin:0;font-size:16px;font-weight:600}.Yv7jna_headerTitle p{color:var(--dsw-alias-label-secondary,#64748b);margin:4px 0 0;font-size:13px}.Yv7jna_closeBtn{cursor:pointer;color:var(--dsw-alias-label-tertiary,#94a3b8);background:0 0;border:none;padding:4px;font-size:16px}.Yv7jna_body{flex-direction:column;gap:16px;padding:24px;display:flex}.Yv7jna_label{color:var(--dsw-alias-label-secondary,#475569);margin-bottom:8px;font-size:13px;font-weight:500;display:block}.Yv7jna_grid{grid-template-columns:repeat(2,1fr);gap:12px;display:grid}.Yv7jna_providerCard{border:1px solid var(--dsw-alias-border-l2,#0000001a);background:var(--dsw-alias-bg-layer-1,#f8fafc);cursor:pointer;text-align:left;border-radius:10px;flex-direction:column;align-items:flex-start;gap:4px;padding:14px;transition:all .15s;display:flex}.Yv7jna_providerCard:hover{background:#10b9810a;border-color:#10b981}.Yv7jna_selected{background:#10b98114;border-color:#10b981;box-shadow:0 0 0 1px #10b981}.Yv7jna_glmCard{border-style:dashed}.Yv7jna_providerIcon{color:#10b981;margin-bottom:2px;font-size:16px;font-weight:700}.Yv7jna_providerCard strong{color:var(--dsw-alias-label-primary,#0f172a);font-size:13px}.Yv7jna_providerCard span{color:var(--dsw-alias-label-secondary,#64748b);font-size:11px}.Yv7jna_authStep,.Yv7jna_resultStep{text-align:center;flex-direction:column;align-items:center;gap:12px;padding:20px 0;display:flex}.Yv7jna_simNotice{color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;max-width:90%;padding:8px 12px;font-size:12px;font-weight:500;line-height:1.4}.Yv7jna_spinner{border:3px solid #10b98133;border-top-color:#10b981;border-radius:999px;width:32px;height:32px;animation:.8s linear infinite Yv7jna_spin}@keyframes Yv7jna_spin{to{transform:rotate(360deg)}}.Yv7jna_urlBox{background:var(--dsw-alias-interactive-bg-subtle,#0000000a);border:1px dashed var(--dsw-alias-border-l2,#00000026);word-break:break-all;max-width:90%;color:var(--dsw-alias-label-primary,#0f172a);user-select:all;border-radius:6px;padding:8px 12px;font-family:monospace;font-size:12px}.Yv7jna_deviceCodeBox{color:#92400e;background:#fef3c7;border-radius:8px;align-items:center;gap:8px;padding:8px 16px;font-size:13px;display:flex}.Yv7jna_hint{color:var(--dsw-alias-label-tertiary,#94a3b8);font-size:12px}.Yv7jna_successIcon{color:#fff;background:#10b981;border-radius:999px;justify-content:center;align-items:center;width:44px;height:44px;font-size:20px;font-weight:700;display:flex}.Yv7jna_formStep{flex-direction:column;gap:16px;padding:8px 0;display:flex}.Yv7jna_formBadge{color:#065f46;background:#10b98126;border-radius:4px;align-self:flex-start;padding:2px 6px;font-size:10px;font-weight:700}.Yv7jna_formTitle{color:var(--dsw-alias-label-primary,#0f172a);margin:0;font-size:15px;font-weight:600}.Yv7jna_formDesc{color:var(--dsw-alias-label-secondary,#64748b);margin:-8px 0 4px;font-size:12px;line-height:1.5}.Yv7jna_fieldGroup{flex-direction:column;gap:6px;display:flex}.Yv7jna_fieldLabel{color:var(--dsw-alias-label-primary,#334155);font-size:12px;font-weight:500}.Yv7jna_textInput{border:1px solid var(--dsw-alias-border-l2,#00000026);background:var(--dsw-alias-bg-layer-1,#f8fafc);width:100%;color:var(--dsw-alias-label-primary,#0f172a);box-sizing:border-box;border-radius:8px;padding:8px 12px;font-family:inherit;font-size:13px}.Yv7jna_textInput:focus{border-color:#10b981;outline:none;box-shadow:0 0 0 2px #10b98133}.Yv7jna_fieldTip{color:var(--dsw-alias-label-tertiary,#94a3b8);font-size:11px}.Yv7jna_footer{border-top:1px solid var(--dsw-alias-border-l2,#00000014);background:var(--dsw-alias-bg-layer-1,#f8fafc);justify-content:flex-end;gap:12px;padding:16px 24px;display:flex}";
		const tagId$2 = "@deepseek-ai/dsh-client-ui-desktop/LoginModal.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-desktop";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var LoginModal_module_css_default = {
			"authStep": "Yv7jna_authStep",
			"backdrop": "Yv7jna_backdrop",
			"body": "Yv7jna_body",
			"closeBtn": "Yv7jna_closeBtn",
			"deviceCodeBox": "Yv7jna_deviceCodeBox",
			"dialog": "Yv7jna_dialog",
			"fieldGroup": "Yv7jna_fieldGroup",
			"fieldLabel": "Yv7jna_fieldLabel",
			"fieldTip": "Yv7jna_fieldTip",
			"footer": "Yv7jna_footer",
			"formBadge": "Yv7jna_formBadge",
			"formDesc": "Yv7jna_formDesc",
			"formStep": "Yv7jna_formStep",
			"formTitle": "Yv7jna_formTitle",
			"glmCard": "Yv7jna_glmCard",
			"grid": "Yv7jna_grid",
			"header": "Yv7jna_header",
			"headerTitle": "Yv7jna_headerTitle",
			"hint": "Yv7jna_hint",
			"label": "Yv7jna_label",
			"providerCard": "Yv7jna_providerCard",
			"providerIcon": "Yv7jna_providerIcon",
			"resultStep": "Yv7jna_resultStep",
			"selected": "Yv7jna_selected",
			"simNotice": "Yv7jna_simNotice",
			"spin": "Yv7jna_spin",
			"spinner": "Yv7jna_spinner",
			"successIcon": "Yv7jna_successIcon",
			"textInput": "Yv7jna_textInput",
			"urlBox": "Yv7jna_urlBox"
		};
		//#endregion
		//#region src/client/prototype/LoginModal.tsx
		/**
		* Modal dialog for creating an account via CLIProxyAPI login flow.
		*
		* Distinguishes Device Flow vs PKCE Flow vs GLM Coding Plan dedicated key form:
		* - Kimi & xAI: Device Flow (flow=device, user_code, verification_uri fixture, expires_in)
		* - Codex, Claude, Antigravity: PKCE Browser Redirect Flow (URL redirect fixture)
		* - GLM: Coding Plan Dedicated API Key + Coding endpoint form (no OAuth)
		*
		* All URLs strictly use explicit non-operational https://<provider>.example.test/verify
		* fixture links. Prominently labeled as simulated authorization; clicking only advances
		* the fixture simulation without navigating to real third-party endpoints (resolving R5).
		*/
		function getProviderFixtureAuthUri(p) {
			switch (p) {
				case "kimi": return "https://kimi.example.test/verify";
				case "xai": return "https://xai.example.test/verify";
				case "codex": return "https://codex.example.test/verify";
				case "anthropic": return "https://anthropic.example.test/verify";
				case "antigravity": return "https://antigravity.example.test/verify";
				case "glm": return "https://open.bigmodel.cn/api/coding/paas/v4";
			}
		}
		function getProviderDeviceCode(p) {
			if (p === "xai") return "GROK-7890";
			return "KIMI-1234";
		}
		function LoginModal({ initialProvider = "codex", onClose, onSuccess }) {
			const [provider, setProvider] = (0, react.useState)(initialProvider);
			const [step, setStep] = (0, react.useState)("select");
			const expiresIn = 600;
			const [glmApiKey, setGlmApiKey] = (0, react.useState)("");
			const [glmEndpoint, setGlmEndpoint] = (0, react.useState)("https://open.bigmodel.cn/api/coding/paas/v4");
			const isGlm = provider === "glm";
			const isDeviceFlow = provider === "kimi" || provider === "xai";
			const authUri = getProviderFixtureAuthUri(provider);
			const deviceCode = getProviderDeviceCode(provider);
			const handleStart = () => {
				if (isGlm) setStep("apiKeyForm");
				else {
					setStep("authorizing");
					setTimeout(() => {
						setStep("success");
					}, 2400);
				}
			};
			const handleGlmSubmit = () => {
				setStep("success");
			};
			const handleFinish = () => {
				onSuccess({
					provider,
					email: isGlm ? "coding-user@example.com" : `user-${provider}@example.com`,
					tier: isGlm ? "Coding Plan (CN)" : void 0
				});
				onClose();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: LoginModal_module_css_default.backdrop,
				onClick: onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: LoginModal_module_css_default.dialog,
					onClick: (e) => {
						e.stopPropagation();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							className: LoginModal_module_css_default.header,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: LoginModal_module_css_default.headerTitle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "添加账号凭证 · CLIProxyAPI (原型模拟)" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "基于官方 Manager 流程规范：Device Flow 设备码、PKCE 浏览器重定向与专用订阅密钥。" })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: LoginModal_module_css_default.closeBtn,
								onClick: onClose,
								children: "✕"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: LoginModal_module_css_default.body,
							children: [
								step === "select" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: LoginModal_module_css_default.providerList,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: LoginModal_module_css_default.label,
										children: "选择平台认证类型（五家 OAuth 与 GLM 订阅）："
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: LoginModal_module_css_default.grid,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: `${LoginModal_module_css_default.providerCard} ${provider === "kimi" ? LoginModal_module_css_default.selected : ""}`,
												onClick: () => {
													setProvider("kimi");
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: LoginModal_module_css_default.providerIcon,
														children: "K"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "Kimi OAuth" }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Device Flow · 设备码授权 (模拟示意)" })
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: `${LoginModal_module_css_default.providerCard} ${provider === "xai" ? LoginModal_module_css_default.selected : ""}`,
												onClick: () => {
													setProvider("xai");
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: LoginModal_module_css_default.providerIcon,
														children: "Ø"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "xAI Grok OAuth" }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Device Flow · 设备码授权 (模拟示意)" })
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: `${LoginModal_module_css_default.providerCard} ${provider === "codex" ? LoginModal_module_css_default.selected : ""}`,
												onClick: () => {
													setProvider("codex");
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: LoginModal_module_css_default.providerIcon,
														children: "⚡"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "Codex OAuth" }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "PKCE 重定向 · 网页授权 (模拟示意)" })
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: `${LoginModal_module_css_default.providerCard} ${provider === "anthropic" ? LoginModal_module_css_default.selected : ""}`,
												onClick: () => {
													setProvider("anthropic");
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: LoginModal_module_css_default.providerIcon,
														children: "✳"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "Anthropic OAuth" }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "PKCE 重定向 · Claude 授权 (模拟示意)" })
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: `${LoginModal_module_css_default.providerCard} ${provider === "antigravity" ? LoginModal_module_css_default.selected : ""}`,
												onClick: () => {
													setProvider("antigravity");
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: LoginModal_module_css_default.providerIcon,
														children: "▲"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "Antigravity OAuth" }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "PKCE 重定向 · Google 快捷授权 (模拟示意)" })
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												className: `${LoginModal_module_css_default.providerCard} ${provider === "glm" ? LoginModal_module_css_default.selected : ""} ${LoginModal_module_css_default.glmCard}`,
												onClick: () => {
													setProvider("glm");
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: LoginModal_module_css_default.providerIcon,
														children: "◈"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "GLM Coding Plan" }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "CN个人订阅 · 专用 API Key 表单接入 (非 OAuth)" })
												]
											})
										]
									})]
								}),
								step === "authorizing" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: LoginModal_module_css_default.authStep,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: LoginModal_module_css_default.spinner }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h4", { children: [
											"正在等待 ",
											provider.toUpperCase(),
											" ",
											isDeviceFlow ? "设备授权码确认" : "浏览器授权完成",
											"…"
										] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: LoginModal_module_css_default.simNotice,
											children: "⚠️ 【模拟授权】本界面为原型演示环境，不可真实登录，不会向第三方发起外部网络请求。"
										}),
										isDeviceFlow ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "模拟验证网址（不可导航，点击仅用于展示原型）：" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: LoginModal_module_css_default.urlBox,
												"data-testid": "auth-fixture-url",
												children: authUri
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: LoginModal_module_css_default.deviceCodeBox,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "设备用户码：" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: deviceCode })]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: LoginModal_module_css_default.hint,
												children: [
													"设备码在 ",
													String(expiresIn),
													" 秒内有效，CLIProxyAPI 正在轮询授权状态 (flow=device 模拟示意)"
												]
											})
										] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "模拟授权重定向地址（不可导航，点击仅用于展示原型）：" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: LoginModal_module_css_default.urlBox,
												"data-testid": "auth-fixture-url",
												children: authUri
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: LoginModal_module_css_default.hint,
												children: "CLIProxyAPI 本地回调端点正在监听授权返回 (is_webui=true 模拟示意)"
											})
										] })
									]
								}),
								step === "apiKeyForm" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: LoginModal_module_css_default.formStep,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: LoginModal_module_css_default.formBadge,
											children: "Sub2API Coding Plan 订阅模式"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
											className: LoginModal_module_css_default.formTitle,
											children: "输入智谱 GLM Coding 订阅凭据 (CN个人订阅)"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: LoginModal_module_css_default.formDesc,
											children: "基于 Sub2API Coding Plan 移植实现，GLM 订阅采用用户 Coding Plan key 与专属 coding 端点，无需 OAuth 网页回调。"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: LoginModal_module_css_default.fieldGroup,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
													className: LoginModal_module_css_default.fieldLabel,
													children: "订阅专用 API Key："
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "text",
													className: LoginModal_module_css_default.textInput,
													value: glmApiKey,
													onChange: (e) => {
														setGlmApiKey(e.target.value);
													},
													placeholder: "请输入 GLM Coding 订阅专属 API Key (原型演示不保存真实密钥)"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: LoginModal_module_css_default.fieldTip,
													children: "原型演示环境为内存 Mock，不持久化或外传任何密钥。"
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: LoginModal_module_css_default.fieldGroup,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
													className: LoginModal_module_css_default.fieldLabel,
													children: "Coding 专属网关端点："
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "text",
													className: LoginModal_module_css_default.textInput,
													value: glmEndpoint,
													onChange: (e) => {
														setGlmEndpoint(e.target.value);
													},
													placeholder: "https://open.bigmodel.cn/api/coding/paas/v4"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: LoginModal_module_css_default.fieldTip,
													children: "已对齐官方 Coding Plan 端点；普通 /api/paas/v4 为按量 PayG 模式不可用。"
												})
											]
										})
									]
								}),
								step === "success" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: LoginModal_module_css_default.resultStep,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: LoginModal_module_css_default.successIcon,
											children: "✓"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: isGlm ? "GLM 订阅凭据配置就绪！" : "OAuth 授权成功并已保存认证文件！" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: isGlm ? "已接入 GLM Coding Plan 订阅路由，模型目录就绪。" : "账号凭证已由 CLIProxyAPI 加密暂存，模型目录已就绪。" })
									]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
							className: LoginModal_module_css_default.footer,
							children: [
								step === "select" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "ghost",
									onClick: onClose,
									children: "取消"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									onClick: handleStart,
									children: isGlm ? "配置 GLM 订阅凭据" : `开始 ${provider.toUpperCase()} 登录`
								})] }),
								step === "authorizing" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									onClick: () => {
										setStep("select");
									},
									children: "返回选择"
								}),
								step === "apiKeyForm" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "ghost",
									onClick: () => {
										setStep("select");
									},
									children: "返回"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									onClick: handleGlmSubmit,
									children: "保存并接入账号池"
								})] }),
								step === "success" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									onClick: handleFinish,
									children: "完成并进入账号池"
								})
							]
						})
					]
				})
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/yishu.cy/IdeaProjects/deepseek-harness/packages/client/ui-desktop/src/client/prototype/PrototypeSwitcher.module.css.mjs
		const css$1 = ".h6DSga_switcher{z-index:9999;border:1px solid var(--dsw-alias-border-inverted,#ffffff26);background:var(--dsw-alias-bg-layer-2,#1e222b);backdrop-filter:blur(12px);color:var(--dsw-alias-label-primary,#f0f3f6);user-select:none;border-radius:20px;flex-direction:column;align-items:center;gap:8px;padding:8px 14px;font-family:inherit;font-size:12px;display:flex;position:fixed;bottom:24px;left:50%;transform:translate(-50%);box-shadow:0 12px 32px #00000073}.h6DSga_controls{align-items:center;gap:12px;display:flex}.h6DSga_navBtn{border:1px solid var(--dsw-alias-border-l2,#ffffff1a);background:var(--dsw-alias-interactive-bg-subtle,#ffffff0d);width:24px;height:24px;color:inherit;cursor:pointer;border-radius:6px;justify-content:center;align-items:center;font-size:13px;transition:all .15s;display:inline-flex}.h6DSga_navBtn:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff1f)}.h6DSga_info{flex-direction:column;align-items:center;gap:2px;display:flex}.h6DSga_badge{letter-spacing:.06em;color:#064e3b;background:#10b981;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700}.h6DSga_title{font-size:13px;font-weight:600}.h6DSga_desc{color:var(--dsw-alias-label-secondary,#94a3b8);font-size:11px}.h6DSga_pills{gap:6px;display:flex}.h6DSga_pill{color:var(--dsw-alias-label-secondary,#94a3b8);cursor:pointer;background:0 0;border:1px solid #0000;border-radius:12px;padding:2px 8px;font-size:11px}.h6DSga_pill:hover{color:var(--dsw-alias-label-primary,#f0f3f6)}.h6DSga_pillActive{background:var(--dsw-alias-interactive-bg-selected,#10b98133);color:#10b981;border-color:#10b981;font-weight:600}";
		const tagId$1 = "@deepseek-ai/dsh-client-ui-desktop/PrototypeSwitcher.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-desktop";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var PrototypeSwitcher_module_css_default = {
			"badge": "h6DSga_badge",
			"controls": "h6DSga_controls",
			"desc": "h6DSga_desc",
			"info": "h6DSga_info",
			"navBtn": "h6DSga_navBtn",
			"pill": "h6DSga_pill",
			"pillActive": "h6DSga_pillActive",
			"pills": "h6DSga_pills",
			"switcher": "h6DSga_switcher",
			"title": "h6DSga_title"
		};
		//#endregion
		//#region src/client/prototype/PrototypeSwitcher.tsx
		/**
		* Prototype switcher floating bar at the bottom center of the screen.
		* Strictly scaffolding; hidden in production or when not in prototype mode.
		*/
		function PrototypeSwitcher({ current, variants, onChange }) {
			const currentIndex = Math.max(0, variants.findIndex((v) => v.id === current));
			const prev = () => {
				const target = variants[(currentIndex - 1 + variants.length) % variants.length];
				if (target !== void 0) onChange(target.id);
			};
			const next = () => {
				const target = variants[(currentIndex + 1) % variants.length];
				if (target !== void 0) onChange(target.id);
			};
			const active = variants[currentIndex] ?? variants[0];
			if (active === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				className: PrototypeSwitcher_module_css_default.switcher,
				"aria-label": "Prototype Variant Switcher",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PrototypeSwitcher_module_css_default.controls,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: PrototypeSwitcher_module_css_default.navBtn,
							onClick: prev,
							"aria-label": "Previous variant",
							children: "←"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: PrototypeSwitcher_module_css_default.info,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PrototypeSwitcher_module_css_default.badge,
									children: "PROTOTYPE DRAFT"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", {
									className: PrototypeSwitcher_module_css_default.title,
									children: [
										active.id,
										": ",
										active.label
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: PrototypeSwitcher_module_css_default.desc,
									children: active.description
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: PrototypeSwitcher_module_css_default.navBtn,
							onClick: next,
							"aria-label": "Next variant",
							children: "→"
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: PrototypeSwitcher_module_css_default.pills,
					children: variants.map((v) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${PrototypeSwitcher_module_css_default.pill} ${v.id === current ? PrototypeSwitcher_module_css_default.pillActive : ""}`,
						onClick: () => {
							onChange(v.id);
						},
						children: v.id
					}, v.id))
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/yishu.cy/IdeaProjects/deepseek-harness/packages/client/ui-desktop/src/client/prototype/CliProxyAccountPoolPrototype.module.css.mjs
		const css = ".-XE5gW_prototypeHost{flex-direction:column;gap:20px;width:100%;padding-bottom:80px;display:flex}.-XE5gW_kernelBar{background:var(--dsw-alias-interactive-bg-subtle,#0000000a);border:1px solid var(--dsw-alias-border-l2,#00000014);border-radius:12px;justify-content:space-between;align-items:center;padding:12px 16px;display:flex}.-XE5gW_kernelInfo{align-items:center;gap:10px;display:flex}.-XE5gW_kernelBadge{color:#fff;letter-spacing:.04em;background:#0284c7;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700}.-XE5gW_kernelTitle{color:var(--dsw-alias-label-primary,#0f172a);font-size:13px;font-weight:600}.-XE5gW_kernelDesc{color:var(--dsw-alias-label-secondary,#64748b);font-size:12px}.-XE5gW_kernelActions{align-items:center;gap:6px;display:flex}.-XE5gW_healthyDot{background:#10b981;border-radius:999px;width:8px;height:8px}.-XE5gW_runtimeText{color:var(--dsw-alias-label-secondary,#64748b);font-family:monospace;font-size:12px;font-weight:500}.-XE5gW_workspaceHeader{justify-content:space-between;align-items:center;gap:16px;padding-bottom:8px;display:flex}.-XE5gW_headerLeft{flex-direction:column;gap:4px;display:flex}.-XE5gW_pageTitle{color:var(--dsw-alias-label-primary,#0f172a);margin:0;font-size:20px;font-weight:700}.-XE5gW_summaryCounts{color:var(--dsw-alias-label-secondary,#64748b);align-items:center;gap:8px;font-size:12px;display:flex}.-XE5gW_countActive{color:#10b981;font-weight:600}.-XE5gW_countError{color:#ef4444;font-weight:600}.-XE5gW_headerRight{align-items:center;gap:16px;display:flex}.-XE5gW_globalFaceSwitch{align-items:center;gap:8px;display:flex}.-XE5gW_switchTitle{color:var(--dsw-alias-label-tertiary,#94a3b8);font-size:12px}.-XE5gW_switchGroup{background:var(--dsw-alias-interactive-bg-subtle,#0000000d);border:1px solid var(--dsw-alias-border-l2,#00000014);border-radius:8px;padding:2px;display:flex}.-XE5gW_faceBtn{color:var(--dsw-alias-label-secondary,#64748b);cursor:pointer;background:0 0;border:none;border-radius:6px;padding:4px 10px;font-size:12px;font-weight:500;transition:all .15s}.-XE5gW_faceBtnActive{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#0f172a);font-weight:600;box-shadow:0 1px 4px #00000014}.-XE5gW_addDropdownContainer{position:relative}.-XE5gW_dropdownMenu{z-index:1000;background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-inverted,#0000001a);border-radius:12px;flex-direction:column;width:220px;padding:6px;display:flex;position:absolute;top:calc(100% + 6px);right:0;box-shadow:0 12px 28px #0000002e}.-XE5gW_dropdownHeader{color:var(--dsw-alias-label-tertiary,#94a3b8);padding:6px 10px;font-size:11px;font-weight:600}.-XE5gW_dropdownItem{color:var(--dsw-alias-label-primary,#1e293b);cursor:pointer;text-align:left;background:0 0;border:none;border-radius:6px;align-items:center;gap:8px;padding:8px 10px;font-size:12px;transition:background .1s;display:flex}.-XE5gW_dropdownItem:hover{background:var(--dsw-alias-interactive-bg-hover,#0000000d)}.-XE5gW_dropIcon{color:#10b981;width:18px;font-weight:700}.-XE5gW_filterBar{flex-wrap:wrap;gap:8px;padding:4px 0;display:flex}.-XE5gW_cardsGrid{grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;display:grid}.-XE5gW_cardsGridDense{grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;display:grid}.-XE5gW_overviewStrip{grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:8px;display:grid}.-XE5gW_overviewCard{background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#00000014);border-radius:12px;flex-direction:column;gap:4px;padding:14px 18px;display:flex}.-XE5gW_overviewLabel{color:var(--dsw-alias-label-secondary,#64748b);font-size:12px}.-XE5gW_overviewCard strong{color:var(--dsw-alias-label-primary,#0f172a);font-size:18px;font-weight:700}";
		const tagId = "@deepseek-ai/dsh-client-ui-desktop/CliProxyAccountPoolPrototype.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-desktop";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CliProxyAccountPoolPrototype_module_css_default = {
			"addDropdownContainer": "-XE5gW_addDropdownContainer",
			"cardsGrid": "-XE5gW_cardsGrid",
			"cardsGridDense": "-XE5gW_cardsGridDense",
			"countActive": "-XE5gW_countActive",
			"countError": "-XE5gW_countError",
			"dropIcon": "-XE5gW_dropIcon",
			"dropdownHeader": "-XE5gW_dropdownHeader",
			"dropdownItem": "-XE5gW_dropdownItem",
			"dropdownMenu": "-XE5gW_dropdownMenu",
			"faceBtn": "-XE5gW_faceBtn",
			"faceBtnActive": "-XE5gW_faceBtnActive",
			"filterBar": "-XE5gW_filterBar",
			"globalFaceSwitch": "-XE5gW_globalFaceSwitch",
			"headerLeft": "-XE5gW_headerLeft",
			"headerRight": "-XE5gW_headerRight",
			"healthyDot": "-XE5gW_healthyDot",
			"kernelActions": "-XE5gW_kernelActions",
			"kernelBadge": "-XE5gW_kernelBadge",
			"kernelBar": "-XE5gW_kernelBar",
			"kernelDesc": "-XE5gW_kernelDesc",
			"kernelInfo": "-XE5gW_kernelInfo",
			"kernelTitle": "-XE5gW_kernelTitle",
			"overviewCard": "-XE5gW_overviewCard",
			"overviewLabel": "-XE5gW_overviewLabel",
			"overviewStrip": "-XE5gW_overviewStrip",
			"pageTitle": "-XE5gW_pageTitle",
			"prototypeHost": "-XE5gW_prototypeHost",
			"runtimeText": "-XE5gW_runtimeText",
			"summaryCounts": "-XE5gW_summaryCounts",
			"switchGroup": "-XE5gW_switchGroup",
			"switchTitle": "-XE5gW_switchTitle",
			"workspaceHeader": "-XE5gW_workspaceHeader"
		};
		//#endregion
		//#region src/client/prototype/CliProxyAccountPoolPrototype.tsx
		/**
		* CliProxyAccountPoolPrototype:
		* The fused interaction prototype mounted on Settings 'sub2api' (Account Pool) route.
		* Presents 3 distinct variants exploring density, timeline marker styling, and layout:
		* - Variant A: Balanced Grid with Needle Timeline Overlay (User screenshot 1 & 4 fused)
		* - Variant B: High-Density List with Band Timeline Comparison (Operational focus)
		* - Variant C: Card Deck with Top Metric Summary & Detailed Dual-Track (Analytical focus)
		*/
		function CliProxyAccountPoolPrototype() {
			const [variant, setVariant] = (0, react.useState)("A");
			const [accounts, setAccounts] = (0, react.useState)(MOCK_ACCOUNTS);
			const [globalFace, setGlobalFace] = (0, react.useState)("A");
			const [globalEpoch, setGlobalEpoch] = (0, react.useState)(0);
			const [filterProvider, setFilterProvider] = (0, react.useState)("all");
			const [showLoginModal, setShowLoginModal] = (0, react.useState)(false);
			const [selectedAddProvider, setSelectedAddProvider] = (0, react.useState)("codex");
			const [showDropdown, setShowDropdown] = (0, react.useState)(false);
			const handleGlobalFaceCommand = (target) => {
				setGlobalFace(target);
				setGlobalEpoch((e) => e + 1);
			};
			const filtered = accounts.filter((acc) => {
				if (filterProvider === "all") return true;
				return acc.provider === filterProvider;
			});
			const counts = {
				all: accounts.length,
				kimi: accounts.filter((a) => a.provider === "kimi").length,
				codex: accounts.filter((a) => a.provider === "codex").length,
				anthropic: accounts.filter((a) => a.provider === "anthropic").length,
				antigravity: accounts.filter((a) => a.provider === "antigravity").length,
				xai: accounts.filter((a) => a.provider === "xai").length,
				glm: accounts.filter((a) => a.provider === "glm").length
			};
			const handleCreateAccount = (newAcc) => {
				const item = {
					id: `${newAcc.provider}-${String(Date.now())}`,
					filename: `${newAcc.provider}-${newAcc.email}.json`,
					provider: newAcc.provider,
					label: newAcc.provider === "glm" ? `GLM ${newAcc.tier ?? "Coding Plan"}` : `${newAcc.provider.toUpperCase()} 新凭据`,
					accountEmail: newAcc.email,
					tier: newAcc.tier ?? "Standard",
					status: "active",
					successCount: 0,
					failCount: 0,
					healthHistory: [true],
					createdAt: (/* @__PURE__ */ new Date()).toLocaleDateString(),
					metrics: [{
						key: "5h",
						name: newAcc.provider === "glm" ? "GLM-4 / 5.3 订阅周期额度" : "5h 初始额度",
						percentRemaining: 100,
						timeRemainingPercent: 100,
						windowLabel: newAcc.provider === "glm" ? "周期额度" : "5h",
						resetText: "100% · 刚刚添加",
						isReliable: true
					}]
				};
				setAccounts((prev) => [item, ...prev]);
			};
			const handleDelete = (id) => {
				setAccounts((prev) => prev.filter((a) => a.id !== id));
			};
			const handleRefreshQuota = (id) => {
				setAccounts((prev) => prev.map((a) => {
					if (a.id !== id) return a;
					return {
						...a,
						status: "active",
						statusMessage: void 0,
						metrics: a.metrics.length > 0 ? a.metrics : [{
							key: "fresh-window",
							name: "主窗口限额",
							percentRemaining: 88,
							timeRemainingPercent: 65,
							windowLabel: "周限额",
							resetText: "88% · 探测已刷新",
							isReliable: true
						}]
					};
				}));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CliProxyAccountPoolPrototype_module_css_default.prototypeHost,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CliProxyAccountPoolPrototype_module_css_default.kernelBar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CliProxyAccountPoolPrototype_module_css_default.kernelInfo,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CliProxyAccountPoolPrototype_module_css_default.kernelBadge,
									children: "DESKTOP BUILT-IN"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									className: CliProxyAccountPoolPrototype_module_css_default.kernelTitle,
									children: "CLIProxyAPI 账号池核心已就绪 (v7.2.155)"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CliProxyAccountPoolPrototype_module_css_default.kernelDesc,
									children: "开箱即用 Go 原生核心，内置 Composite Provider 自动注册；无需单独下载 sidecar 组件。"
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CliProxyAccountPoolPrototype_module_css_default.kernelActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: CliProxyAccountPoolPrototype_module_css_default.healthyDot }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CliProxyAccountPoolPrototype_module_css_default.runtimeText,
								children: "127.0.0.1:8317 · 运行正常"
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: CliProxyAccountPoolPrototype_module_css_default.workspaceHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CliProxyAccountPoolPrototype_module_css_default.headerLeft,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: CliProxyAccountPoolPrototype_module_css_default.pageTitle,
								children: "认证文件与配额管理"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CliProxyAccountPoolPrototype_module_css_default.summaryCounts,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										"共 ",
										accounts.length,
										" 个凭证"
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "·" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: CliProxyAccountPoolPrototype_module_css_default.countActive,
										children: [accounts.filter((a) => a.status === "active").length, " 个启用"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "·" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: CliProxyAccountPoolPrototype_module_css_default.countError,
										children: [accounts.filter((a) => a.status === "error" || a.status === "warning").length, " 个需关注"]
									})
								]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CliProxyAccountPoolPrototype_module_css_default.headerRight,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CliProxyAccountPoolPrototype_module_css_default.globalFaceSwitch,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CliProxyAccountPoolPrototype_module_css_default.switchTitle,
									children: "卡片视图:"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: CliProxyAccountPoolPrototype_module_css_default.switchGroup,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: `${CliProxyAccountPoolPrototype_module_css_default.faceBtn} ${globalFace === "A" ? CliProxyAccountPoolPrototype_module_css_default.faceBtnActive : ""}`,
										onClick: () => {
											handleGlobalFaceCommand("A");
										},
										"data-testid": "global-face-btn-a",
										children: "📋 管理面 (A面)"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: `${CliProxyAccountPoolPrototype_module_css_default.faceBtn} ${globalFace === "B" ? CliProxyAccountPoolPrototype_module_css_default.faceBtnActive : ""}`,
										onClick: () => {
											handleGlobalFaceCommand("B");
										},
										"data-testid": "global-face-btn-b",
										children: "📊 额度面 (B面)"
									})]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: CliProxyAccountPoolPrototype_module_css_default.addDropdownContainer,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									onClick: () => {
										setShowDropdown((prev) => !prev);
									},
									children: "+ 添加账号 ▾"
								}), showDropdown && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: CliProxyAccountPoolPrototype_module_css_default.dropdownMenu,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: CliProxyAccountPoolPrototype_module_css_default.dropdownHeader,
											children: "选择认证提供方:"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: CliProxyAccountPoolPrototype_module_css_default.dropdownItem,
											onClick: () => {
												setSelectedAddProvider("kimi");
												setShowDropdown(false);
												setShowLoginModal(true);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: CliProxyAccountPoolPrototype_module_css_default.dropIcon,
												children: "K"
											}), " Kimi OAuth (设备授权)"]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: CliProxyAccountPoolPrototype_module_css_default.dropdownItem,
											onClick: () => {
												setSelectedAddProvider("xai");
												setShowDropdown(false);
												setShowLoginModal(true);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: CliProxyAccountPoolPrototype_module_css_default.dropIcon,
												children: "Ø"
											}), " xAI Grok OAuth (设备授权)"]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: CliProxyAccountPoolPrototype_module_css_default.dropdownItem,
											onClick: () => {
												setSelectedAddProvider("codex");
												setShowDropdown(false);
												setShowLoginModal(true);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: CliProxyAccountPoolPrototype_module_css_default.dropIcon,
												children: "⚡"
											}), " Codex OAuth"]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: CliProxyAccountPoolPrototype_module_css_default.dropdownItem,
											onClick: () => {
												setSelectedAddProvider("anthropic");
												setShowDropdown(false);
												setShowLoginModal(true);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: CliProxyAccountPoolPrototype_module_css_default.dropIcon,
												children: "✳"
											}), " Anthropic OAuth"]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: CliProxyAccountPoolPrototype_module_css_default.dropdownItem,
											onClick: () => {
												setSelectedAddProvider("antigravity");
												setShowDropdown(false);
												setShowLoginModal(true);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: CliProxyAccountPoolPrototype_module_css_default.dropIcon,
												children: "▲"
											}), " Antigravity OAuth"]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: CliProxyAccountPoolPrototype_module_css_default.dropdownItem,
											onClick: () => {
												setSelectedAddProvider("glm");
												setShowDropdown(false);
												setShowLoginModal(true);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: CliProxyAccountPoolPrototype_module_css_default.dropIcon,
												children: "◈"
											}), " GLM Coding Plan (订阅密钥表单)"]
										})
									]
								})]
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CliProxyAccountPoolPrototype_module_css_default.filterBar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
								active: filterProvider === "all",
								onClick: () => {
									setFilterProvider("all");
								},
								children: [
									"全部 (",
									counts.all,
									")"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
								active: filterProvider === "codex",
								onClick: () => {
									setFilterProvider("codex");
								},
								children: [
									"⚡ Codex (",
									counts.codex,
									")"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
								active: filterProvider === "antigravity",
								onClick: () => {
									setFilterProvider("antigravity");
								},
								children: [
									"▲ Antigravity (",
									counts.antigravity,
									")"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
								active: filterProvider === "anthropic",
								onClick: () => {
									setFilterProvider("anthropic");
								},
								children: [
									"✳ Anthropic (",
									counts.anthropic,
									")"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
								active: filterProvider === "kimi",
								onClick: () => {
									setFilterProvider("kimi");
								},
								children: [
									"K Kimi (",
									counts.kimi,
									")"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
								active: filterProvider === "xai",
								onClick: () => {
									setFilterProvider("xai");
								},
								children: [
									"Ø xAI (",
									counts.xai,
									")"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
								active: filterProvider === "glm",
								onClick: () => {
									setFilterProvider("glm");
								},
								children: [
									"◈ GLM (",
									counts.glm,
									")"
								]
							})
						]
					}),
					variant === "A" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CliProxyAccountPoolPrototype_module_css_default.variantA,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CliProxyAccountPoolPrototype_module_css_default.cardsGrid,
							children: filtered.map((acc) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountCard, {
								item: acc,
								globalFace,
								globalEpoch,
								styleVariant: "needle",
								onDelete: handleDelete,
								onRefreshQuota: handleRefreshQuota
							}, acc.id))
						})
					}),
					variant === "B" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CliProxyAccountPoolPrototype_module_css_default.variantB,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CliProxyAccountPoolPrototype_module_css_default.cardsGridDense,
							children: filtered.map((acc) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountCard, {
								item: acc,
								globalFace,
								globalEpoch,
								styleVariant: "band",
								onDelete: handleDelete,
								onRefreshQuota: handleRefreshQuota
							}, acc.id))
						})
					}),
					variant === "C" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CliProxyAccountPoolPrototype_module_css_default.variantC,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CliProxyAccountPoolPrototype_module_css_default.overviewStrip,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: CliProxyAccountPoolPrototype_module_css_default.overviewCard,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: CliProxyAccountPoolPrototype_module_css_default.overviewLabel,
										children: "可用凭据总量"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: accounts.length })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: CliProxyAccountPoolPrototype_module_css_default.overviewCard,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: CliProxyAccountPoolPrototype_module_css_default.overviewLabel,
										children: "全网流量健康度"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										style: { color: "#10b981" },
										children: "99.1%"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: CliProxyAccountPoolPrototype_module_css_default.overviewCard,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: CliProxyAccountPoolPrototype_module_css_default.overviewLabel,
										children: "当前重置窗口周期"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "5h / 7d 双层" })]
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CliProxyAccountPoolPrototype_module_css_default.cardsGrid,
							children: filtered.map((acc) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountCard, {
								item: acc,
								globalFace,
								globalEpoch,
								styleVariant: "compact",
								onDelete: handleDelete,
								onRefreshQuota: handleRefreshQuota
							}, acc.id))
						})]
					}),
					showLoginModal && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoginModal, {
						initialProvider: selectedAddProvider,
						onClose: () => {
							setShowLoginModal(false);
						},
						onSuccess: handleCreateAccount
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PrototypeSwitcher, {
						current: variant,
						variants: [
							{
								id: "A",
								label: "平衡双面网格 · 针式时间刻度",
								description: "融合截图1与截图2；同轴额度条叠加红针时间窗口剩余对比"
							},
							{
								id: "B",
								label: "高密操作布局 · 带状时间重叠",
								description: "紧凑卡片排布；带状半透明范围展现时间窗口对比"
							},
							{
								id: "C",
								label: "监控概览卡组 · 窗口分析强化",
								description: "顶置健康概览流；强化各模型限额与同轴刻度细化"
							}
						],
						onChange: (v) => {
							setVariant(v);
						}
					})
				]
			});
		}
		//#endregion
		//#region src/client/Sub2ApiControlWrapper.tsx
		/**
		* Prototype wrapper for mounting on Settings 'sub2api' section.
		* Sub-shape A: Injects the CLIProxyAPI fused prototype directly when ?prototype=true
		* or in non-production, while preserving normal snapshot hooks.
		*/
		function Sub2ApiControlWrapper(props) {
			if ((0, react.useMemo)(() => {
				if (typeof window === "undefined") return false;
				return new URLSearchParams(window.location.search).get("prototype") !== "false";
			}, [])) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CliProxyAccountPoolPrototype, {});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Sub2ApiControl, { ...props });
		}
		//#endregion
		//#region src/client/DesktopChromeOverlay.tsx
		/**
		* Native overlay document menu, stacked above official page
		* `WebContentsView`s. Settings remain owned by the sidebar settings seat.
		* @module @deepseek-ai/dsh-client-ui-desktop/client/DesktopChromeOverlay
		*/
		/**
		* Map a tab-descriptor id onto the same glyph the in-page + menu uses.
		* Known ids: editor, git, subagent, sidechat, browser, terminal, phone.
		* @param id - serialized `icon` from the Host chrome request.
		* @returns the glyph, or undefined when the id is unknown.
		*/
		function overlayMenuIcon(id) {
			if (id === "editor") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size: 16 });
			if (id === "git") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, { size: 16 });
			if (id === "subagent") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutline16, { size: 16 });
			if (id === "sidechat") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconNewChatOutline16, { size: 16 });
			if (id === "browser") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutline14, { size: 16 });
			if (id === "terminal") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 16 });
			if (id === "phone") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPhoneOutline16, { size: 16 });
		}
		/**
		* Read overlay verbs when this document is the Desktop overlay renderer.
		* @param bridge - `window.dshDesktop` or a test double.
		* @returns the verbs, or undefined in `dsh web`.
		*/
		function overlayDesktopBridgeOf(bridge) {
			if (typeof bridge !== "object" || bridge === null) return void 0;
			const record = bridge;
			if (typeof record.chromeOverlayGetState !== "function" || typeof record.chromeOverlayResult !== "function" || typeof record.onChromeOverlayState !== "function") return void 0;
			return record;
		}
		/**
		* Render the native overlay Menu. The sidebar settings seat independently
		* observes settings requests.
		* @returns the menu tree, or null while hidden or showing Settings.
		*/
		function DesktopChromeOverlay() {
			const [request, setRequest] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				const bridge = overlayDesktopBridgeOf(globalThis.dshDesktop);
				if (bridge === void 0) return;
				bridge.chromeOverlayGetState().then(setRequest);
				return bridge.onChromeOverlayState(setRequest);
			}, []);
			if (request === null || request.kind !== "menu") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open: true,
				portal: true,
				align: request.align ?? "start",
				side: request.side ?? "bottom",
				items: request.items.map((item) => {
					const icon = overlayMenuIcon(item.icon);
					return {
						id: item.id,
						label: item.label,
						...item.disabled === true ? { disabled: true } : {},
						...icon === void 0 ? {} : { icon }
					};
				}),
				getAnchorRect: () => new DOMRect(request.anchor.x, request.anchor.y, request.anchor.width, request.anchor.height),
				onSelect: (id) => {
					overlayDesktopBridgeOf(globalThis.dshDesktop)?.chromeOverlayResult({
						type: "select",
						requestId: request.requestId,
						id
					});
				},
				onClose: () => {
					overlayDesktopBridgeOf(globalThis.dshDesktop)?.chromeOverlayResult({
						type: "close",
						requestId: request.requestId
					});
				},
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
			});
		}
		//#endregion
		//#region src/client/status-source.ts
		/** Default snapshot before the Desktop Host pushes a status. */
		const INITIAL_UPDATER_STATUS = Object.freeze({
			state: "idle",
			lastCheckedAt: null
		});
		/**
		* Create a status source the renderer binds as `useUpdater`.
		* @param onListenerError - subscriber failure reporter.
		* @returns getSnapshot / subscribe / set.
		*/
		function createUpdaterSource(onListenerError = (error) => {
			console.error("updater subscriber failed", error);
		}) {
			let snapshot = INITIAL_UPDATER_STATUS;
			const listeners = /* @__PURE__ */ new Set();
			return {
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				set: (status) => {
					snapshot = status;
					for (const listener of listeners) try {
						listener();
					} catch (error) {
						onListenerError(error);
					}
				}
			};
		}
		/**
		* Bind the Desktop bridge without letting an initial read overwrite a newer push.
		* @param source - renderer updater source.
		* @param desktop - preload bridge.
		* @param onError - initial read failure reporter.
		* @returns disposer that blocks all later writes.
		*/
		function bindDesktopUpdater(source, desktop, onError = (error) => {
			console.error("failed to read updater status", error);
		}) {
			let active = true;
			let pushSeen = false;
			const unsubscribe = desktop.onStatus((status) => {
				if (!active) return;
				pushSeen = true;
				source.set(status);
			});
			desktop.getStatus().then((status) => {
				if (active && !pushSeen) source.set(status);
			}).catch((error) => {
				if (active) onError(error);
			});
			return () => {
				active = false;
				unsubscribe();
			};
		}
		//#endregion
		//#region src/client/snapshot-hub.ts
		/** Shared get/subscribe/set hub for Desktop renderer snapshots. */
		/**
		* Create a snapshot hub that notifies subscribers and isolates listener throws.
		* @param initial - first snapshot before any Host push.
		* @param onListenerError - reports one failing subscriber without skipping later subscribers.
		* @returns get/subscribe/set hub.
		*/
		function createSnapshotHub(initial, onListenerError) {
			let snapshot = initial;
			const listeners = /* @__PURE__ */ new Set();
			return {
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				set: (next) => {
					snapshot = next;
					for (const listener of [...listeners]) try {
						listener();
					} catch (error) {
						onListenerError(error);
					}
				}
			};
		}
		//#endregion
		//#region src/client/snapshot-source.ts
		/**
		* Mutable snapshot plus subscriber fan-out for Desktop Host pushes.
		* Account and pairing sources share this ledger so a late read cannot race
		* a push and one failing listener cannot skip the rest.
		*/
		/**
		* Create a mutable snapshot source.
		* @param initial - value before the Desktop Host answers.
		* @param onListenerError - reports one subscriber exception without skipping later subscribers.
		* @returns the source the composition owns.
		*/
		function createDesktopSnapshotSource(initial, onListenerError) {
			return createSnapshotHub(initial, onListenerError);
		}
		/**
		* Bind a Host read and push so a late initial read cannot overwrite a newer push.
		* @param source - renderer snapshot source to update.
		* @param subscribe - Host push subscription that returns its disposer.
		* @param read - Host snapshot read that may settle after a push.
		* @param onError - reports failure of the initial Host read while the bind is active.
		* @returns disposer that blocks later writes and unsubscribes the Host push.
		*/
		function bindDesktopSnapshot(source, subscribe, read, onError) {
			let active = true;
			let pushSeen = false;
			const unsubscribe = subscribe((snapshot) => {
				if (!active) return;
				pushSeen = true;
				source.set(snapshot);
			});
			read().then((snapshot) => {
				if (active && !pushSeen) source.set(snapshot);
			}).catch((error) => {
				if (active) onError(error);
			});
			return () => {
				active = false;
				unsubscribe();
			};
		}
		//#endregion
		//#region src/client/account-source.ts
		/** Initial state before the Desktop Host answers. */
		const INITIAL_ACCOUNT_SNAPSHOT = Object.freeze({
			status: "unavailable",
			privacyAccepted: false
		});
		/**
		* Create the source consumed through the slot hook compartment.
		* @param onListenerError - reports an exception from one subscriber without skipping later subscribers.
		* @returns mutable snapshot source owned by the Desktop UI composition.
		*/
		function createDesktopAccountSource(onListenerError = (error) => {
			console.error("account subscriber failed", error);
		}) {
			return createDesktopSnapshotSource(INITIAL_ACCOUNT_SNAPSHOT, onListenerError);
		}
		/**
		* Bind Host reads and pushes without allowing a late initial read to win.
		* @param source - renderer snapshot source to update.
		* @param desktop - preload Account read and subscription methods.
		* @param onError - reports failure of the initial Host read.
		* @returns disposer for the Host snapshot subscription.
		*/
		function bindDesktopAccount(source, desktop, onError = (error) => {
			console.error("failed to read account status", error);
		}) {
			return bindDesktopSnapshot(source, (listener) => desktop.onAccountSnapshot(listener), () => desktop.accountGetSnapshot(), onError);
		}
		//#endregion
		//#region src/client/pairing-source.ts
		/** Initial disabled state before the Desktop Host answers. */
		const INITIAL_PAIRING_SNAPSHOT = Object.freeze({
			status: "unavailable",
			enabled: false,
			pairings: []
		});
		/**
		* Create the source consumed through the Settings slot hook compartment.
		* @param onListenerError - reports one failing subscriber without skipping later subscribers.
		* @returns mutable snapshot source owned by the Desktop UI composition.
		*/
		function createDesktopPairingSource(onListenerError = (error) => {
			console.error("pairing subscriber failed", error);
		}) {
			return createDesktopSnapshotSource(INITIAL_PAIRING_SNAPSHOT, onListenerError);
		}
		/**
		* Bind Host reads and pushes without allowing a late initial read to win.
		* @param source - renderer snapshot source to update.
		* @param desktop - preload pairing read and subscription methods.
		* @param onError - reports failure of the initial Host read while the binding is active.
		* @returns caller-owned disposer that blocks later writes and unsubscribes the Host snapshot subscription.
		*/
		function bindDesktopPairing(source, desktop, onError = (error) => {
			console.error("failed to read pairing status", error);
		}) {
			return bindDesktopSnapshot(source, (listener) => desktop.onPairingSnapshot(listener), () => desktop.pairingGetSnapshot(), onError);
		}
		//#endregion
		//#region src/client/sub2api-source.ts
		/** Initial missing state before the Desktop Host answers. */
		const INITIAL_SUB2API_SNAPSHOT = Object.freeze({
			state: "missing",
			enabled: true
		});
		/**
		* Create the source consumed through the Settings slot hook compartment.
		* @param onListenerError - reports one failing subscriber without skipping later subscribers.
		* @returns mutable snapshot source owned by the Desktop UI composition.
		*/
		function createDesktopSub2ApiSource(onListenerError = (error) => {
			console.error("sub2api subscriber failed", error);
		}) {
			return createDesktopSnapshotSource(INITIAL_SUB2API_SNAPSHOT, onListenerError);
		}
		/**
		* Bind Host reads and pushes without allowing a late initial read to win.
		* @param source - renderer snapshot source to update.
		* @param desktop - preload Sub2API read and subscription methods.
		* @param onError - reports failure of the initial Host read.
		* @returns disposer for the Host snapshot subscription.
		*/
		function bindDesktopSub2Api(source, desktop, onError = (error) => {
			console.error("failed to read Sub2API component state", error);
		}) {
			return bindDesktopSnapshot(source, (listener) => desktop.onSub2ApiSnapshot(listener), () => desktop.sub2ApiGetSnapshot(), onError);
		}
		//#endregion
		//#region src/client/locales.ts
		/** Desktop chrome copy. Product strings are Chinese; English is the fallback. */
		const zh = {
			"update.check": "检查更新",
			"update.checking": "正在检查更新",
			"update.available": "下载 {version}",
			"update.downloading": "正在下载 {percent}%",
			"update.preparing": "正在准备更新",
			"update.install": "安装并重启",
			"update.idle": "已是最新",
			"update.disabled": "开发版不检查更新",
			"update.error": "更新失败",
			"window.minimize": "最小化",
			"window.maximize": "最大化",
			"window.close": "关闭",
			"account.title": "Platform 账号",
			"account.settingsNav": "手机配对",
			"account.sectionDescription": "登录 Platform 账号后，即可把手机安全连接到这台电脑。",
			"account.close": "关闭",
			"account.signIn": "使用 GitHub 登录",
			"account.signOut": "退出登录",
			"account.unavailable": "这台电脑尚未配置 Platform 账号。",
			"account.signedInDescription": "已使用 GitHub 登录。退出登录不会解除已有的手机配对。",
			"account.finishBrowser": "请在系统浏览器中完成 GitHub 登录",
			"account.polling": "此窗口会安全地等待登录结果。",
			"account.privacyBadge": "隐私说明 / Privacy",
			"account.noticeTitle": "授权前请确认数据保留规则",
			"account.consent": "我已阅读中英文隐私说明，并理解首个版本不提供账号删除。",
			"account.continueGitHub": "继续前往 GitHub",
			"account.cancelLogin": "取消登录",
			"pairing.mobileAccess": "手机访问",
			"pairing.mobileAccessDescription": "开启后，已配对的手机可在这台电脑在线时查看和继续会话。",
			"pairing.createChallenge": "创建手机配对",
			"pairing.scan": "用已登录同一账号的手机扫描",
			"pairing.fullLink": "也可以复制完整的一次性链接；不提供手输短码。",
			"pairing.qrLabel": "手机配对二维码",
			"pairing.cancel": "取消配对",
			"pairing.compareWords": "请在手机和桌面端比对以下认证词",
			"pairing.confirm": "确认配对",
			"pairing.reject": "拒绝",
			"pairing.revoke": "撤销配对",
			"pairing.online": "在线",
			"pairing.offline": "离线",
			"pairing.paired": "配对时间",
			"pairing.lastAccess": "最近访问",
			"sub2api.settingsNav": "账号池",
			"sub2api.title": "Sub2API 账号池",
			"sub2api.offerTitle": "在本机启用 Sub2API 账号池",
			"sub2api.offerBody": "启用后，Desktop 在本机监督一个 Sub2API 组件：把上游平台账号接入本地账号池，并把 Composite 推理端点注册为本地提供方。组件只在 Desktop 运行，浏览器 dsh web 没有此入口。",
			"sub2api.download": "下载并启用",
			"sub2api.downloadNote": "首次启用需下载组件 bundle 与运行时包（含 Sub2API 与便携 PostgreSQL/Redis，约数百 MB）；DeepSeek Gestalt 安装包体积不变。",
			"sub2api.dataNote": "账号数据保存在 ~/.dsh/sub2api/data；卸载时可选择是否删除。运行时文件不包含在安装包内，可随时重新下载。",
			"sub2api.downloading": "正在下载 {percent}%",
			"sub2api.downloadingIndeterminate": "正在下载…",
			"sub2api.verifying": "正在校验 SHA256SUMS…",
			"sub2api.installed": "已安装",
			"sub2api.disabled": "已停用：组件不随 Web Host 启动，账号数据保留。",
			"sub2api.starting": "正在启动本机组件（首次启动需初始化数据库，可能需要数分钟）…",
			"sub2api.running": "运行中",
			"sub2api.consoleTitle": "Sub2API 账号台",
			"sub2api.enable": "启用",
			"sub2api.disable": "停用",
			"sub2api.uninstall": "卸载",
			"sub2api.uninstallKeep": "卸载（保留账号数据）",
			"sub2api.uninstallDelete": "卸载并删除账号数据",
			"sub2api.cancel": "取消",
			"sub2api.retry": "重试"
		};
		/** English fallback for Desktop chrome copy. */
		const en = {
			"update.check": "Check for updates",
			"update.checking": "Checking for updates",
			"update.available": "Download {version}",
			"update.downloading": "Downloading {percent}%",
			"update.preparing": "Preparing update",
			"update.install": "Install and restart",
			"update.idle": "Up to date",
			"update.disabled": "Updates disabled in development",
			"update.error": "Update failed",
			"window.minimize": "Minimize",
			"window.maximize": "Maximize",
			"window.close": "Close",
			"account.title": "Platform Account",
			"account.settingsNav": "Mobile pairing",
			"account.sectionDescription": "Sign in to Platform to connect your phone securely to this computer.",
			"account.close": "Close",
			"account.signIn": "Sign in with GitHub",
			"account.signOut": "Sign out",
			"account.unavailable": "Platform Account is not configured on this computer.",
			"account.signedInDescription": "Signed in with GitHub. Signing out keeps existing phone pairings.",
			"account.finishBrowser": "Finish GitHub sign-in in your system browser",
			"account.polling": "This window will securely wait for the result.",
			"account.privacyBadge": "Privacy / 隐私说明",
			"account.noticeTitle": "Review data retention before authorization",
			"account.consent": "I have read both notices and understand the first version has no account deletion.",
			"account.continueGitHub": "Continue to GitHub",
			"account.cancelLogin": "Cancel sign-in",
			"pairing.mobileAccess": "Mobile Access",
			"pairing.mobileAccessDescription": "Enable only here in Settings; normal Session views stay unchanged.",
			"pairing.createChallenge": "Create phone pairing",
			"pairing.scan": "Scan with a phone signed in to the same account",
			"pairing.fullLink": "Or copy the complete one-time link; there is no short manual code.",
			"pairing.qrLabel": "Personal Pairing QR code",
			"pairing.cancel": "Cancel pairing",
			"pairing.compareWords": "Compare these authentication words on Mobile and Desktop",
			"pairing.confirm": "Confirm pairing",
			"pairing.reject": "Reject",
			"pairing.revoke": "Revoke pairing",
			"pairing.online": "online",
			"pairing.offline": "offline",
			"pairing.paired": "Paired",
			"pairing.lastAccess": "Last access",
			"sub2api.settingsNav": "Account pool",
			"sub2api.title": "Sub2API account pool",
			"sub2api.offerTitle": "Enable the Sub2API account pool on this machine",
			"sub2api.offerBody": "When enabled, Desktop supervises a local Sub2API component: upstream platform accounts join a local account pool, and the Composite inference endpoint registers as a local provider. The component exists only in Desktop; browser dsh web has no entry point.",
			"sub2api.download": "Download and enable",
			"sub2api.downloadNote": "First enablement downloads the component bundle and a runtime pack (Sub2API plus portable PostgreSQL/Redis, several hundred MB); the DeepSeek Gestalt installer size stays unchanged.",
			"sub2api.dataNote": "Account data lives in ~/.dsh/sub2api/data; uninstall asks whether to delete it. Runtime files ship outside the installer and can be downloaded again at any time.",
			"sub2api.downloading": "Downloading {percent}%",
			"sub2api.downloadingIndeterminate": "Downloading…",
			"sub2api.verifying": "Verifying SHA256SUMS…",
			"sub2api.installed": "Installed",
			"sub2api.disabled": "Disabled: the component does not start with the Web Host; account data is kept.",
			"sub2api.starting": "Starting the local component (first start initializes the database and can take minutes)…",
			"sub2api.running": "Running",
			"sub2api.consoleTitle": "Sub2API account console",
			"sub2api.enable": "Enable",
			"sub2api.disable": "Disable",
			"sub2api.uninstall": "Uninstall",
			"sub2api.uninstallKeep": "Uninstall (keep account data)",
			"sub2api.uninstallDelete": "Uninstall and delete account data",
			"sub2api.cancel": "Cancel",
			"sub2api.retry": "Retry"
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "desktop";
		/** Required services: slots plus desktop copy. */
		const inject = ["slots", "locale"];
		/**
		* Register Desktop chrome into sidebar holes declared by ui-sidebar.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-desktop: dictionaries");
			const updater = createUpdaterSource();
			const account = createDesktopAccountSource();
			const pairing = createDesktopPairingSource();
			const sub2api = createDesktopSub2ApiSource();
			/* v8 ignore next -- the client half always has window */
			const desktop = typeof window === "undefined" ? void 0 : window.dshDesktop;
			if (desktop !== void 0) {
				ctx.effect(() => bindDesktopUpdater(updater, desktop), "ui-desktop: updater status");
				ctx.effect(() => bindDesktopAccount(account, desktop), "ui-desktop: account status");
				ctx.effect(() => bindDesktopPairing(pairing, desktop), "ui-desktop: pairing status");
				if (desktop.projectMembership !== void 0) ctx.provide("projectMembershipClient", desktop.projectMembership);
				ctx.effect(() => bindDesktopSub2Api(sub2api, desktop), "ui-desktop: sub2api status");
			}
			ctx.slots.inject("sidebar.brand", () => ctx.slots.register({
				name: "sidebar.brand",
				select: () => ({}),
				locale: NS
			}, BrandSeat));
			ctx.slots.inject("sidebar.chrome.drag", () => ctx.slots.register({
				name: "sidebar.chrome.drag",
				id: "desktop-drag",
				locale: NS
			}, DragStrip));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "mobile-pairing",
				order: 50,
				label: () => ctx.locale.bind(NS)("account.settingsNav"),
				locale: NS,
				inject: () => ({ hooks: {
					account,
					pairing
				} })
			}, AccountControl));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "sub2api",
				order: 51,
				label: () => ctx.locale.bind(NS)("sub2api.settingsNav"),
				locale: NS,
				inject: () => ({ hooks: { sub2api } })
			}, Sub2ApiControlWrapper));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "desktop-update",
				locale: NS,
				inject: () => ({ hooks: { updater } })
			}, UpdateControl));
			if (typeof document !== "undefined" && document.documentElement.hasAttribute("data-dsh-desktop-overlay")) ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "desktop-chrome-overlay"
			}, DesktopChromeOverlay));
		}
		//#endregion
		exports.INITIAL_ACCOUNT_SNAPSHOT = INITIAL_ACCOUNT_SNAPSHOT;
		exports.INITIAL_SUB2API_SNAPSHOT = INITIAL_SUB2API_SNAPSHOT;
		exports.INITIAL_UPDATER_STATUS = INITIAL_UPDATER_STATUS;
		exports.apply = apply;
		exports.bindDesktopAccount = bindDesktopAccount;
		exports.bindDesktopSub2Api = bindDesktopSub2Api;
		exports.bindDesktopUpdater = bindDesktopUpdater;
		exports.createDesktopAccountSource = createDesktopAccountSource;
		exports.createDesktopSub2ApiSource = createDesktopSub2ApiSource;
		exports.createUpdaterSource = createUpdaterSource;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.cjs.map