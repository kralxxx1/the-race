-- BenchController: working at a repair bench.
--
--   * orbit camera around the device (right-drag / Q,E to turn, wheel to zoom, Space to stand up)
--   * tool bar (1-0 keys); the tool model follows the mouse over the device
--   * hovering a part shows what the tool would do and, if it can't, why (straight from the rules)
--   * left click acts; timed jobs (prying, desoldering, cleaning...) need the button held;
--     thermal paste is a little hold-and-release game; empty slots open the parts picker
--   * right click lists everything you can do to that part with any tool you own
--   * the side panels run tests (power, stress, POST card, PSU tester, thermal camera, USB tools)
--     and finish the job

local Players = game:GetService("Players")
local GuiService = game:GetService("GuiService")
local RunService = game:GetService("RunService")
local StarterGui = game:GetService("StarterGui")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Signal = require(Shared.Util.Signal)
local Parts = require(Shared.Data.Parts)
local Tools = require(Shared.Data.Tools)
local Rules = require(Shared.Repair.RepairRules)
local ToolModels = require(Shared.Models.ToolModels)

local Client = script.Parent.Parent
local S = require(Client.Strings)
local State = require(Client.State)
local Kit = require(Client.UI.Kit)
local Theme = require(Client.UI.Theme)
local App = require(Client.UI.App)
local BenchViews = require(script.Parent.BenchViews)
local BenchCoach = require(script.Parent.BenchCoach)
local Glossary = require(Shared.Data.Glossary)

local BenchController = {}
BenchController.acted = Signal.new() -- (action, result) after every successful bench action

local player = Players.LocalPlayer

local gui: ScreenGui
local hud
local ui = {} :: { [string]: any }
local active = nil :: any -- { bench = n, model = Workbench, job = summary }
local toolId = "hand"
local toolModel: Model? = nil
local hover = nil :: any -- { id, primary, ok, reason, pos, normal }
local highlight: Highlight
local busy = false
local holding = nil :: any
-- The camera looks at the middle of the device from close up and above; zooming in with the wheel
-- drifts the focus towards the part under the mouse (off follows offT smoothly).
local CAM_FOCUS = Vector3.new(-0.4, 0.55, 0)
local CAM_START = { yaw = 0, pitch = 1.02, dist = 4.8 }
local orbit = { yaw = 0, pitch = CAM_START.pitch, dist = CAM_START.dist, off = Vector3.zero, offT = Vector3.zero }
local labelsOn = true
local labelFolder: Folder? = nil
local labels = {} :: { [string]: { gui: BillboardGui, anchor: Part } }
local labelClock = 0
local hiddenParts = {} :: { [BasePart]: boolean }
local dragging = false
local dragMoved = 0
local touchStart: Vector2? = nil
local conns = {}

local TIMED = Config.HoldActionSeconds

-- What the work sounds like (Config.Sounds.Bench): these loop while the action is held, the rest
-- play once when the server confirms the action.
local HELD_SOUND = { unscrew = true, screw = true, blow_dust = true, brush = true, clean_paste = true, clean_liquid = true, peel = true }

-- (id, gain): an entry is an id or { id = ..., volume = ... }
local function benchSound(key: string): (string?, number)
	local b = Config.Sounds and Config.Sounds.Bench
	local e = b and b[key]
	if type(e) == "table" then
		return e.id, e.volume or 1
	end
	return e, 1
end

local build -- builds the bench UI (defined below)

----------------------------------------------------------------------------------------------------
-- helpers
----------------------------------------------------------------------------------------------------
local function lang(): string
	return S.lang()
end

local function view()
	return active and BenchViews.view(active.model) or nil
end

local function handle()
	return active and BenchViews.handle(active.model) or nil
end

local function ctx(tool: string)
	return { tool = tool, owned = State.ownedTools(), lang = lang() }
end

local function nodeLabel(v, id: string): string
	return Rules.label(v, id, lang())
end

local function partName(v, id: string): string?
	local s = v.nodes[id]
	local p = s and s.part and Parts.get(s.part)
	return p and p.name or nil
end

local ST = {
	["in"] = { "Takılı", "Fitted" },
	out = { "Sökülmüş", "Removed" },
	empty = { "Boş", "Empty" },
	loose = { "Gevşek", "Loose" },
	open = { "Açık", "Open" },
	closed = { "Kapalı", "Closed" },
	ok = { "Düzgün", "Straight" },
	bent = { "Eğik!", "Bent!" },
	peeled = { "Kaldırılmış", "Peeled" },
}
local function stText(st: string?): string
	local e = st and ST[st]
	return if e then (if lang() == "en" then e[2] else e[1]) else (st or "")
end

local function toolSpeed(id: string): number
	local t = Tools.get(id)
	return t and t.speed or 1
end

-- Everything a tool could do to a node, best guess first.
local function candidates(v, id: string, tid: string)
	local tn = Rules.tnode(v, id)
	local tool = Tools.get(tid)
	if not tn or not tool then
		return {}
	end
	local s = v.nodes[id]
	local st = s and s.st
	local out = {}
	local function add(a: string, args: { [string]: any }?)
		if table.find(tool.actions, a) then
			table.insert(out, { action = a, args = args })
		end
	end
	local k = tn.kind
	if k == "screw" then
		add(if st == "in" then "unscrew" else "screw")
	elseif k == "cable" then
		add(if st == "in" then "unplug" else "plug")
	elseif k == "latch" then
		add(if st == "open" then "close_latch" else "open_latch")
	elseif k == "feet" then
		if st == "in" then
			add("peel")
		else
			add("install")
		end
	elseif k == "panel" then
		if st == "in" then
			if tn.pry then
				add("pry")
			end
			add("remove")
		elseif st == "loose" then
			add("remove")
			add("install")
		else
			add("install")
		end
	elseif k == "comp" then
		local soldered = Rules.isSoldered(v, id)
		if st == "in" then
			if soldered then
				add("desolder")
			end
			if tn.pry then
				add("pry")
			end
			add("remove")
		elseif st == "loose" then
			if soldered then
				add("solder")
			end
			add("remove")
			add("install", { source = "self" })
		elseif st == "out" then
			add("install", { source = "self" })
		elseif st == "empty" then
			add("install", { pick = true })
		end
		if tn.dusty then
			add("blow_dust")
			add("brush")
		end
		add("inspect")
		add("measure")
	elseif k == "pins" then
		add("straighten_pins")
		add("inspect")
	elseif k == "board" then
		add("blow_dust")
		add("brush")
		add("clean_liquid")
		add("inspect")
	end
	if (v.kind == "desktop" and id == "cpu") or (v.kind == "laptop" and id == "lboard") then
		add("clean_paste")
		add("apply_paste")
	end
	if v.kind == "laptop" and id == "keyboard" then
		add("clean_liquid")
	end
	return out
end

-- The action the click will do and whether the rules allow it.
local function resolve(v, id: string, tid: string)
	local list = candidates(v, id, tid)
	local first = nil
	for _, c in list do
		if c.args and c.args.pick then
			return c, true, nil
		end
		local ok, reason, vars = Rules.check(v, c.action, id, c.args, ctx(tid))
		if ok then
			return c, true, nil
		end
		if not first then
			first = { c = c, reason = Rules.message(reason :: string, lang(), vars) }
		end
	end
	if first then
		return first.c, false, first.reason
	end
	return nil, false, nil
end

----------------------------------------------------------------------------------------------------
-- UI
----------------------------------------------------------------------------------------------------
local logN = 0
local LOG_MAX = 60

-- Newest finding on top; the oldest drop off.
local function log(text: string, color: Color3?)
	if not ui.log then
		return
	end
	logN += 1
	Kit.label(ui.log, text, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 14, TextColor3 = color or Theme.text, LayoutOrder = -logN })
	local items = {}
	for _, c in ui.log:GetChildren() do
		if c:IsA("TextLabel") then
			table.insert(items, c)
		end
	end
	if #items > LOG_MAX then
		table.sort(items, function(a, b)
			return a.LayoutOrder < b.LayoutOrder
		end)
		for i = LOG_MAX + 1, #items do
			items[i]:Destroy()
		end
	end
end

local function setAdornee(target: Instance?)
	if highlight.Adornee ~= target then
		highlight.Adornee = target
	end
end

local function setHint(text: string?, ok: boolean?)
	if not ui.hint then
		return
	end
	if not text then
		ui.hint.Visible = false
		return
	end
	ui.hint.Visible = true
	ui.hintText.Text = text
	ui.hintStroke.Color = if ok then Theme.good else Theme.bad
end

local function selectTool(id: string)
	if not State.owns(id) then
		return
	end
	toolId = id
	for tid, b in ui.toolButtons or {} do
		Kit.setColor(b, if tid == id then Theme.accent else Theme.card)
	end
	if toolModel then
		toolModel:Destroy()
		toolModel = nil
	end
	local t = Tools.get(id)
	if t and active then
		toolModel = ToolModels.build(t.model or "hand", Workspace)
	end
	if ui.toolName then
		ui.toolName.Text = (t and t.icon or "") .. " " .. (t and S.pick(t.name) or "")
	end
end

local function buildToolbar()
	Kit.clear(ui.tools)
	ui.toolButtons = {}
	local n = 0
	for _, t in Tools.list do
		if State.owns(t.id) and not t.passive then
			n += 1
			local key = if n <= 9 then tostring(n) elseif n == 10 then "0" else ""
			local b = Kit.button(ui.tools, t.icon, function()
				selectTool(t.id)
			end, { Size = UDim2.fromOffset(52, 52), TextSize = 26, LayoutOrder = n })
			b.Name = t.id
			if key ~= "" then
				Kit.label(b, key, { Size = UDim2.fromOffset(14, 14), Position = UDim2.fromOffset(4, 2), TextSize = 12, TextColor3 = Theme.dim, FontFace = Theme.bold })
			end
			ui.toolButtons[t.id] = b
			b:SetAttribute("Key", key)
		end
	end
	selectTool(if State.owns(toolId) then toolId else "hand")
end

local function jobCard()
	local j = active and active.job
	BenchCoach.reset(j and j.id or nil)
	Kit.clear(ui.jobInfo)
	if not j then
		Kit.label(ui.jobInfo, S.t("bench_no_job"), { TextColor3 = Theme.dim })
		return
	end
	Kit.label(ui.jobInfo, "<b>" .. (j.name or "") .. "</b>", { TextSize = 17, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	if j.customer then
		Kit.label(ui.jobInfo, "👤 " .. j.customer.name, { TextColor3 = Theme.dim, TextSize = 14 })
	elseif j.own then
		Kit.label(ui.jobInfo, "🛠️ " .. S.t("job_own"), { TextColor3 = Theme.dim, TextSize = 14 })
	end
	if j.complaint and #j.complaint > 0 then
		Kit.label(ui.jobInfo, "“" .. j.complaint .. "”", { TextSize = 14, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextColor3 = Color3.fromRGB(220, 226, 236), FontFace = Theme.font })
	end
	if j.price and j.price > 0 then
		Kit.label(ui.jobInfo, "💵 " .. S.money(j.price), { TextColor3 = Theme.money, FontFace = Theme.bold })
	end
	local missing = {}
	for _, t in j.tools or {} do
		if not State.owns(t) then
			local tool = Tools.get(t)
			table.insert(missing, tool and (tool.icon .. " " .. S.pick(tool.name)) or t)
		end
	end
	if #missing > 0 then
		Kit.label(ui.jobInfo, S.t("missing_tool", { list = table.concat(missing, ", ") }), { TextColor3 = Theme.bad, TextSize = 14, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	end
end

local function refreshDiag()
	local v = view()
	local has = v ~= nil
	for _, b in ui.diag or {} do
		local need = b:GetAttribute("Tool")
		local kindOnly = b:GetAttribute("Kind")
		b.Visible = has and (not need or State.owns(need)) and (not kindOnly or (v ~= nil and v.kind == kindOnly))
	end
	if ui.finish then
		ui.finish.Visible = has
	end
	if ui.unload then
		ui.unload.Visible = has
	end
	if ui.strap and v then
		Kit.setColor(ui.strap, if v.strap then Theme.good else Theme.card)
	end
end

local function showJobPicker()
	Kit.clear(ui.picker)
	ui.pickerFrame.Visible = true
	local any = false
	for _, j in State.jobs do
		if j.status == "waiting" then
			any = true
			local icon = if j.device == "laptop" then "💻" else "🖥️"
			local sub = (j.customer and ("👤 " .. j.customer.name .. " • ") or "🛠️ ") .. (if j.price and j.price > 0 then S.money(j.price) else S.t("job_own"))
			local _, right = Kit.row(ui.picker, icon, j.name or j.id, sub)
			Kit.button(right, S.t("bench_load"), function()
				local r = Net.request("bench.load", { job = j.id })
				if r.ok then
					active.job = r.job
					BenchViews.apply(active.model, r.view, r.rev)
					ui.pickerFrame.Visible = false
					jobCard()
					refreshDiag()
				else
					hud.toast(S.err(r.err), "bad")
				end
			end, { Size = UDim2.fromOffset(120, 36) }, "primary")
		end
	end
	if not any then
		Kit.label(ui.picker, S.t("job_none"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 60) })
	end
end

-- Shows test results on the side log and the bench monitor.
local function showResult(r)
	if r.findings then
		for _, f in r.findings do
			log("🔍 " .. f)
		end
	end
	if r.reading then
		log("📟 " .. r.reading, Theme.accent)
	end
	if r.quality then
		log(S.t("paste_q", { n = math.floor(r.quality * 100) }), if r.quality > 0.7 then Theme.good else Theme.warn)
	end
	if r.code then
		log(S.t("post_code", { code = r.code }), Theme.accent2)
	end
	if r.eval then
		local e = r.eval
		local st = Rules.StageText[e.stage]
		log("⚡ " .. (if st then S.pick(st) else e.stage), if e.stage == "ok" then Theme.good else Theme.bad)
		if e.temps and (e.temps.cpu or e.temps.gpu) then
			log("🌡️ " .. S.t("temps", { cpu = math.floor(e.temps.cpu or 0), gpu = math.floor(e.temps.gpu or 0) }))
		end
		for _, key in e.issues or {} do
			local it = Rules.IssueText[key]
			log("⚠️ " .. (if it then S.pick(it) else key), Theme.warn)
		end
	end
	if r.software then
		local sw = r.software
		local lines = table.concat(sw.lines or {}, "\n")
		log("💾 " .. S.t("sw_" .. tostring(sw.program)) .. "\n" .. lines, if sw.ok then Theme.text else Theme.bad)
		BenchViews.monitor(active.model, S.t("sw_" .. tostring(sw.program)) .. "\n\n" .. lines, Color3.fromRGB(0, 40, 90))
	end
	if r.esd then
		hud.toast(S.t("t_esd_zap", { node = nodeLabel(view(), r.esd) }), "bad", 6)
	end
end

----------------------------------------------------------------------------------------------------
-- Doing things
----------------------------------------------------------------------------------------------------
-- The motherboard speaker after pressing power: one short beep is a good POST, three are memory
-- (or bent socket pins), four the graphics card; no power or no POST stays silent.
local function postBeeps(stage: string)
	if stage == "no_power" or stage == "no_post" then
		return
	end
	local n = if stage == "beeps" then 3 elseif stage == "no_display" then 4 else 1
	local id, gain = benchSound("beep")
	for i = 0, n - 1 do
		task.delay(0.8 + i * 0.6, App.play, id, 0.35 * gain)
	end
end

local function send(action: string, target: string?, args: { [string]: any }?, tid: string?)
	if busy or not active then
		return nil
	end
	busy = true
	local r = Net.request("repair.act", { action = action, target = target, args = args, tool = tid or toolId })
	busy = false
	if r.view then
		BenchViews.apply(active.model, r.view, r.rev)
	end
	if r.ok then
		if not HELD_SOUND[action] then
			local id, gain = benchSound(action)
			App.play(id, 0.5 * gain)
		end
		if action == "press_power" and r.eval then
			postBeeps(r.eval.stage)
		end
		showResult(r)
		refreshDiag()
		BenchController.acted:Fire(action, r)
	else
		local msg = if r.reason then Rules.message(r.reason, lang(), r.vars) else S.err(r.err)
		setHint(msg, false)
		log("✖ " .. msg, Theme.bad)
	end
	return r
end

-- Holds the mouse for `seconds`; returns true when completed.
local function holdFor(seconds: number, label: string): boolean
	if seconds <= 0 then
		return true
	end
	holding = { t0 = os.clock(), dur = seconds, done = false, cancelled = false }
	ui.hold.Visible = true
	ui.holdLabel.Text = label
	while holding and not holding.cancelled do
		local f = (os.clock() - holding.t0) / holding.dur
		ui.holdBar:set(f)
		if f >= 1 then
			break
		end
		RunService.RenderStepped:Wait()
	end
	local ok = holding ~= nil and not holding.cancelled
	holding = nil
	ui.hold.Visible = false
	return ok
end

-- Thermal paste: hold to squeeze, release in the green zone.
local function pasteGame(target: string)
	local lo, hi = Config.PasteIdealRange[1], Config.PasteIdealRange[2]
	ui.paste.Visible = true
	ui.pasteZone.Position = UDim2.fromScale(lo, 0)
	ui.pasteZone.Size = UDim2.fromScale(hi - lo, 1)
	local t0 = os.clock()
	local amount = 0
	local syringe = toolModel
	local base = syringe and syringe:GetPivot()
	holding = { t0 = t0, dur = 2.4, done = false, cancelled = false, paste = true }
	while holding and not holding.cancelled do
		amount = math.clamp((os.clock() - t0) / 2.4, 0, 1)
		if syringe and base and syringe.Parent then
			-- the plunger goes in as the paste comes out
			syringe:PivotTo(base * CFrame.new(0, -0.12 * amount, 0))
		end
		ui.pasteFill.Size = UDim2.fromScale(amount, 1)
		ui.pasteText.Text = S.t("paste_amount", { n = math.floor(amount * 100) })
		if amount >= 1 then
			break
		end
		RunService.RenderStepped:Wait()
	end
	holding = nil
	task.delay(0.6, function()
		ui.paste.Visible = false
	end)
	if amount < 0.03 then
		return
	end
	send("apply_paste", target, { amount = amount }, "paste_syringe")
end

local function openPartPicker(id: string)
	local v = view()
	if not v then
		return
	end
	local win = Kit.window(gui, S.t("bench_install_title", { slot = nodeLabel(v, id) }), Vector2.new(620, 460))
	local list = Kit.list(win.content)
	local any = false
	local function entry(item, source: string)
		local p = Parts.get(item.part)
		if not p then
			return
		end
		local ok, why = Rules.compatible(v, id, p, lang())
		local cond = if item.cond and item.cond < 0.999 then S.t("cond", { n = math.floor(item.cond * 100) }) else S.t("cond_new")
		local sub = cond .. (if item.broken then " • " .. S.t("broken") else "") .. (if not ok then " • " .. tostring(why) else "")
		local _, right = Kit.row(list, Theme.catIcon[p.cat] or "📦", p.name, sub)
		local b = Kit.button(right, S.t("act_install"), function()
			win.close()
			send("install", id, { source = source, part = item.part, uid = item.uid }, "hand")
		end, { Size = UDim2.fromOffset(110, 36) }, if ok then "primary" else nil)
		Kit.setEnabled(b, ok)
		if ok then
			any = true
		end
	end
	for _, t in v.tray or {} do
		entry(t, "tray")
	end
	local tn = Rules.tnode(v, id)
	for _, item in State.data and State.data.inv or {} do
		local p = Parts.get(item.part)
		if p and tn and p.cat == tn.cat then
			entry(item, "inv")
		end
	end
	if not any then
		Kit.label(list, S.t("bench_install_none"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
	end
end

-- How each kind of work looks: the tool moves the way it's used and the work shows.
local SMOKE = "rbxasset://textures/particles/smoke_main.dds"
local FX = {
	unscrew = { spin = 16, lift = 0.22 },
	screw = { spin = -16, lift = -0.18 },
	blow_dust = { shake = 0.03, particles = "dust" },
	brush = { sweep = 0.16, particles = "fluff" },
	desolder = { shake = 0.008, particles = "smoke" },
	solder = { shake = 0.008, particles = "smoke" },
	clean_paste = { circle = 0.08 },
	clean_liquid = { circle = 0.12 },
	pry = { lever = 0.22 },
	peel = { lever = 0.18 },
	straighten_pins = { shake = 0.006 },
}

local function emitter(kind: string, pos: Vector3, normal: Vector3): BasePart
	local p = Instance.new("Part")
	p.Name = "BenchFx"
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Transparency = 1
	p.Size = Vector3.new(0.2, 0.2, 0.2)
	p.CFrame = CFrame.lookAt(pos, pos + normal)
	local pe = Instance.new("ParticleEmitter")
	pe.Texture = SMOKE
	pe.EmissionDirection = Enum.NormalId.Front
	pe.LightInfluence = 1
	if kind == "dust" then
		-- a grey cloud blown out of the heatsink
		pe.Color = ColorSequence.new(Color3.fromRGB(150, 145, 135))
		pe.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.15), NumberSequenceKeypoint.new(1, 1.1) })
		pe.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.35), NumberSequenceKeypoint.new(1, 1) })
		pe.Lifetime = NumberRange.new(0.5, 1.1)
		pe.Rate = 70
		pe.Speed = NumberRange.new(3, 7)
		pe.SpreadAngle = Vector2.new(55, 55)
		pe.Drag = 3
	elseif kind == "fluff" then
		pe.Color = ColorSequence.new(Color3.fromRGB(170, 165, 155))
		pe.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.05), NumberSequenceKeypoint.new(1, 0.3) })
		pe.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.4), NumberSequenceKeypoint.new(1, 1) })
		pe.Lifetime = NumberRange.new(0.4, 0.8)
		pe.Rate = 25
		pe.Speed = NumberRange.new(0.5, 1.5)
		pe.SpreadAngle = Vector2.new(80, 80)
		pe.Acceleration = Vector3.new(0, -2, 0)
	else
		-- solder smoke curling up
		pe.Color = ColorSequence.new(Color3.fromRGB(235, 235, 240))
		pe.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.05), NumberSequenceKeypoint.new(1, 0.5) })
		pe.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.5), NumberSequenceKeypoint.new(1, 1) })
		pe.Lifetime = NumberRange.new(1.2, 2)
		pe.Rate = 16
		pe.Speed = NumberRange.new(0.4, 1)
		pe.Acceleration = Vector3.new(0, 2.2, 0)
		pe.RotSpeed = NumberRange.new(-40, 40)
	end
	pe.Parent = p
	p.Parent = Workspace
	return p
end

-- Starts the tool's working motion (and particles); returns the function that ends it.
local function startFx(action: string, pos: Vector3?, normal: Vector3?): () -> ()
	local def = FX[action]
	local model = toolModel
	if not def or not model then
		return function() end
	end
	local base = model:GetPivot()
	local t0 = os.clock()
	local fxPart = if def.particles and pos then emitter(def.particles, pos, normal or Vector3.yAxis) else nil
	local conn = RunService.RenderStepped:Connect(function()
		if not model.Parent then
			return
		end
		local t = os.clock() - t0
		local cf = base
		if def.spin then
			cf *= CFrame.new(0, (def.lift or 0) * math.min(1, t / 1.2), 0) * CFrame.Angles(0, t * def.spin, 0)
		elseif def.sweep then
			cf *= CFrame.new(math.sin(t * 14) * def.sweep, 0, 0) * CFrame.Angles(0, 0, math.sin(t * 14) * 0.25)
		elseif def.circle then
			cf *= CFrame.new(math.cos(t * 9) * def.circle, 0, math.sin(t * 9) * def.circle)
		elseif def.lever then
			cf *= CFrame.Angles(math.sin(t * 7) * def.lever, 0, 0)
		elseif def.shake then
			local a = def.shake
			cf *= CFrame.new(math.noise(t * 20, 1.3) * a, math.noise(t * 20, 2.7) * a, math.noise(t * 20, 4.1) * a)
		end
		model:PivotTo(cf)
	end)
	return function()
		conn:Disconnect()
		if model.Parent then
			model:PivotTo(base)
		end
		if fxPart then
			local pe = fxPart:FindFirstChildWhichIsA("ParticleEmitter")
			if pe then
				pe.Enabled = false
			end
			task.delay(2.2, function()
				fxPart:Destroy()
			end)
		end
	end
end

-- Runs a resolved action (with its hold time or mini-game).
local function perform(id: string, c, tid: string)
	if not c or busy then
		return
	end
	if c.args and c.args.pick then
		openPartPicker(id)
		return
	end
	if c.action == "apply_paste" then
		pasteGame(id)
		return
	end
	local hold = (TIMED[c.action] or 0) / toolSpeed(tid)
	local stopFx = startFx(c.action, hover and hover.pos, hover and hover.normal)
	local stopSound = function() end
	if HELD_SOUND[c.action] then
		local id, gain = benchSound(c.action)
		stopSound = App.loop(id, 0.45 * gain)
	end
	if hold > 0 then
		local label = S.t("act_" .. c.action) .. " • " .. nodeLabel(view(), id)
		if not holdFor(hold, label) then
			stopFx()
			stopSound()
			return
		end
	end
	-- everything else: the tool dips onto the part while the server works
	if not FX[c.action] and toolModel and hover then
		local base = toolModel:GetPivot()
		task.spawn(function()
			for i = 1, 8 do
				if not toolModel then
					break
				end
				toolModel:PivotTo(base * CFrame.new(0, -0.05 * math.sin(i / 8 * math.pi), 0))
				task.wait(0.03)
			end
		end)
	end
	send(c.action, id, c.args, tid)
	stopFx()
	stopSound()
end

local function nodeMenu(id: string)
	local v = view()
	if not v then
		return
	end
	local s = v.nodes[id]
	local title = nodeLabel(v, id)
	local win = Kit.window(gui, title, Vector2.new(520, 440))
	local info = {}
	table.insert(info, stText(s and s.st))
	local pname = partName(v, id)
	if pname then
		table.insert(info, pname)
	end
	if s and s.cond then
		table.insert(info, S.t("cond", { n = math.floor(s.cond * 100) }))
	end
	if s and s.dust and s.dust > 0.02 then
		table.insert(info, "🌫️ " .. math.floor(s.dust * 100) .. "%")
	end
	Kit.label(win.content, table.concat(info, " • "), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 24) })
	local list = Kit.list(win.content, { Size = UDim2.new(1, 0, 1, -30), Position = UDim2.fromOffset(0, 30) })
	local shown = {}
	for _, t in Tools.list do
		if State.owns(t.id) and not t.passive then
			for _, c in candidates(v, id, t.id) do
				local key = c.action .. ":" .. tostring(c.args and c.args.source)
				if not shown[key] then
					shown[key] = true
					local ok, reason, vars = true, nil, nil
					if not (c.args and c.args.pick) then
						ok, reason, vars = Rules.check(v, c.action, id, c.args, ctx(t.id))
					end
					local sub = if ok then S.pick(t.name) else Rules.message(reason :: string, lang(), vars)
					local _, right = Kit.row(list, t.icon, S.t("act_" .. c.action), sub)
					local b = Kit.button(right, S.t("use"), function()
						win.close()
						selectTool(t.id)
						perform(id, c, t.id)
					end, { Size = UDim2.fromOffset(100, 36) }, if ok then "primary" else nil)
					Kit.setEnabled(b, ok)
				end
			end
		end
	end
	-- removed parts can be moved to the tray
	local tn = Rules.tnode(v, id)
	if tn and tn.kind == "comp" and s and s.st == "out" then
		local _, right = Kit.row(list, "🗑️", S.t("act_discard"), pname or "")
		Kit.button(right, S.t("use"), function()
			win.close()
			send("discard", id, nil, "hand")
		end, { Size = UDim2.fromOffset(100, 36) }, "warn")
	end
end

----------------------------------------------------------------------------------------------------
-- hover / camera / input
----------------------------------------------------------------------------------------------------
-- The device node under the mouse (or under `at`, a viewport point, for touches).
local function pick(at: Vector2?): (string?, Vector3?, Vector3?)
	local h = handle()
	local cam = Workspace.CurrentCamera
	if not h or not cam then
		return nil, nil, nil
	end
	local m = at or UserInputService:GetMouseLocation()
	local ray = cam:ViewportPointToRay(m.X, m.Y)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = { h.model }
	local hit = Workspace:Raycast(ray.Origin, ray.Direction * 60, params)
	if not hit then
		return nil, nil, nil
	end
	return h:nodeOf(hit.Instance), hit.Position, hit.Normal
end

local function updateHover(at: Vector2?)
	local v = view()
	if not v or Kit.currentWindow() then
		setAdornee(nil)
		setHint(nil)
		if toolModel then
			toolModel:PivotTo(CFrame.new(0, -500, 0))
		end
		return
	end
	if busy or holding then
		return -- the tool stays where the work is happening
	end
	local id, pos, normal = pick(at)
	if not id then
		hover = nil
		setAdornee(nil)
		setHint(S.t("bench_hint_pick"), true)
		if toolModel then
			toolModel:PivotTo(CFrame.new(0, -500, 0))
		end
		return
	end
	local c, ok, reason = resolve(v, id, toolId)
	hover = { id = id, c = c, ok = ok, pos = pos, normal = normal }
	local h = handle()
	local nodeModel = h and h.recs[id] and h.recs[id].model or (h and h.cables[id])
	setAdornee(nodeModel)
	highlight.OutlineColor = if c and ok then Theme.good elseif c then Theme.bad else Theme.dim
	local name = nodeLabel(v, id)
	local pname = partName(v, id)
	local title = name .. (if pname then " — " .. pname else "")
	-- a plain-language line about what this is (unless you asked the coach to stay quiet)
	local gloss = ""
	if BenchCoach.help() ~= "off" then
		local gk = Glossary.key(Rules.tnode(v, id))
		local g = gk and Glossary.parts[gk]
		if g then
			gloss = "\n<font color=\"#9fb4d0\"><i>" .. S.pick(g) .. "</i></font>"
		end
	end
	if c then
		local act = S.t("act_" .. c.action)
		setHint("<b>" .. act .. "</b>  " .. title .. (if reason then "\n<font color=\"#ff8080\">" .. reason .. "</font>" else "") .. gloss, ok)
	else
		setHint(title .. "\n<font color=\"#a0a6b4\">" .. stText(v.nodes[id] and v.nodes[id].st) .. "</font>" .. gloss, true)
	end
	-- the tool hovers just above the surface, tilted towards the camera
	if toolModel and pos and normal then
		local cam = Workspace.CurrentCamera
		local up = (normal + (cam.CFrame.Position - pos).Unit * 0.7).Unit
		local right = up:Cross(Vector3.yAxis)
		if right.Magnitude < 1e-3 then
			right = Vector3.xAxis
		end
		toolModel:PivotTo(CFrame.fromMatrix(pos + normal * 0.03, right.Unit, up))
	end
end

-- Your own avatar sits between the camera and the device: hide it (only on your screen) while you
-- work, and show it again when you stand up.
local function hideAvatar(on: boolean)
	local char = player.Character
	if on and char then
		for _, d in char:GetDescendants() do
			if d:IsA("BasePart") then
				d.LocalTransparencyModifier = 1
				hiddenParts[d] = true
			end
		end
	else
		for part in hiddenParts do
			if part.Parent then
				part.LocalTransparencyModifier = 0
			end
		end
		table.clear(hiddenParts)
	end
end

local function clearLabels()
	for _, l in labels do
		l.gui:Destroy()
		l.anchor:Destroy()
	end
	table.clear(labels)
end

-- A small name tag over every part of the device (and over the empty slots), so a newcomer can read
-- what each thing is. Rebuilt whenever the device changes; positions follow the part models.
local function refreshLabels()
	local v, h = view(), handle()
	clearLabels()
	if not labelsOn or not v or not h or not active then
		return
	end
	if not labelFolder then
		labelFolder = Instance.new("Folder")
		labelFolder.Name = "BenchLabels"
		labelFolder.Parent = Workspace
	end
	for id, rec in h.recs do
		local tn = Rules.tnode(v, id)
		local node = v.nodes[id]
		if tn and (tn.kind == "comp" or tn.kind == "panel") and rec.model and node and (node.st == "in" or node.st == "out" or node.st == "loose" or node.st == "open") then
			local a = Instance.new("Part")
			a.Name = "LabelAnchor"
			a.Size = Vector3.new(0.2, 0.2, 0.2)
			a.Transparency = 1
			a.Anchored = true
			a.CanCollide = false
			a.CanQuery = false
			a.CanTouch = false
			a.CastShadow = false
			a.Parent = labelFolder
			local g = Instance.new("BillboardGui")
			g.Name = "Tag"
			g.Adornee = a
			g.AlwaysOnTop = true
			g.Size = UDim2.fromOffset(150, 22)
			g.StudsOffsetWorldSpace = Vector3.new(0, 0.5, 0)
			g.MaxDistance = 24
			g.LightInfluence = 0
			g.Parent = a
			local t = Kit.label(g, nodeLabel(v, id), { Size = UDim2.fromScale(1, 1), TextSize = 13, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Center, TextStrokeTransparency = 0.3, TextColor3 = Color3.fromRGB(255, 248, 210) })
			t.TextScaled = false
			t.BackgroundTransparency = 0.35
			t.BackgroundColor3 = Color3.fromRGB(16, 20, 30)
			Kit.corner(t, UDim.new(0, 5))
			labels[id] = { gui = g, anchor = a }
		end
	end
	labelClock = 1
end

local function placeLabels()
	local h = handle()
	if not h then
		return
	end
	for id, l in labels do
		local rec = h.recs[id]
		local m = rec and rec.model
		if m and m.Parent then
			l.anchor.Position = m:GetPivot().Position
		end
	end
end

local function updateCamera(dt: number?)
	local cam = Workspace.CurrentCamera
	local root = active and BenchViews.rootOf(active.model)
	if not cam or not root then
		return
	end
	orbit.off = orbit.off:Lerp(orbit.offT, math.clamp((dt or 1 / 60) * 9, 0, 1))
	local focus = (root * CFrame.new(CAM_FOCUS + orbit.off)).Position
	local offset = CFrame.Angles(0, orbit.yaw, 0) * CFrame.Angles(-orbit.pitch, 0, 0) * Vector3.new(0, 0, orbit.dist)
	local pos = (root.Rotation * CFrame.new(offset)).Position + focus
	cam.CFrame = CFrame.lookAt(pos, focus)
	cam.FieldOfView = 62
	-- keep the tags on their parts while the parts are being moved around (otherwise a few times
	-- a second is plenty)
	local h = handle()
	if h and next(labels) then
		labelClock += dt or 0
		if labelClock > 0.2 or h:busy() then
			labelClock = 0
			placeLabels()
		end
	end
end

----------------------------------------------------------------------------------------------------
-- enter / exit
----------------------------------------------------------------------------------------------------
local function findBench(n: number): Model?
	local plots = Workspace:FindFirstChild("Plots")
	if not plots then
		return nil
	end
	for _, plot in plots:GetChildren() do
		local shop = plot:FindFirstChild("Shop")
		if shop and shop:GetAttribute("Owner") == player.UserId then
			return shop:FindFirstChild("Workbench_" .. n) :: Model?
		end
	end
	return nil
end

-- The bench screen uses both sides: Roblox's chat window and player list step aside meanwhile.
local function coreGui(on: boolean)
	for _, t in { Enum.CoreGuiType.Chat, Enum.CoreGuiType.PlayerList } do
		pcall(function()
			StarterGui:SetCoreGuiEnabled(t, on)
		end)
	end
end

local function exit()
	if not active then
		return
	end
	active = nil
	coreGui(true)
	for _, c in conns do
		c:Disconnect()
	end
	conns = {}
	ui.root.Visible = false
	ui.pickerFrame.Visible = false
	setAdornee(nil)
	clearLabels()
	hideAvatar(false)
	BenchCoach.leave()
	if toolModel then
		toolModel:Destroy()
		toolModel = nil
	end
	Kit.closeWindow()
	hud.setVisible(true)
	local cam = Workspace.CurrentCamera
	if cam then
		cam.CameraType = Enum.CameraType.Custom
		local char = player.Character
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		if hum then
			cam.CameraSubject = hum
		end
	end
end

local function enter(data)
	local model = findBench(data.bench)
	if not model then
		return
	end
	exit()
	-- the language was changed on the phone: rebuild the panels
	if ui.lang ~= S.lang() then
		ui.root:Destroy()
		highlight:Destroy()
		build()
	end
	active = { bench = data.bench, model = model, job = data.job }
	if data.view then
		BenchViews.apply(model, data.view, data.rev)
	end
	ui.root.Visible = true
	ui.title.Text = S.t("bench_title", { n = data.bench })
	hud.setVisible(false)
	coreGui(false)
	Kit.clear(ui.log)
	buildToolbar()
	jobCard()
	refreshDiag()
	if not data.job then
		showJobPicker()
	else
		ui.pickerFrame.Visible = false
	end
	local cam = Workspace.CurrentCamera
	cam.CameraType = Enum.CameraType.Scriptable
	orbit = { yaw = CAM_START.yaw, pitch = CAM_START.pitch, dist = CAM_START.dist, off = Vector3.zero, offT = Vector3.zero }
	hideAvatar(true)
	refreshLabels()
	table.insert(conns, RunService.RenderStepped:Connect(function(dt)
		updateCamera(dt)
		updateHover()
		if ui.money and State.data then
			ui.money.Text = S.money(State.data.money)
		end
	end))
	table.insert(conns, State.changed:Connect(function()
		buildToolbar()
		refreshDiag()
		refreshLabels()
	end))
	-- a part was fitted or removed (or the device arrived): the tags follow
	table.insert(conns, BenchViews.changed:Connect(function(bench)
		if active and bench == active.model then
			refreshLabels()
			BenchCoach.refresh()
		end
	end))
	-- the avatar respawns: keep it hidden
	table.insert(conns, player.CharacterAdded:Connect(function()
		task.wait(0.2)
		if active then
			hideAvatar(true)
		end
	end))
	table.insert(conns, State.jobsChanged:Connect(function()
		if active and not active.job and ui.pickerFrame.Visible then
			showJobPicker()
		end
	end))
end

----------------------------------------------------------------------------------------------------
-- building the bench UI (once)
----------------------------------------------------------------------------------------------------
local function diagButton(parent: Instance, id: string, text: string, onClick: () -> (), toolNeeded: string?, kind: string?)
	local b = Kit.button(parent, text, onClick, { Size = UDim2.new(1, 0, 0, 38), TextSize = 15 })
	b.Name = id
	if toolNeeded then
		b:SetAttribute("Tool", toolNeeded)
	end
	if kind then
		b:SetAttribute("Kind", kind)
	end
	ui.diag[id] = b
	return b
end

local function softwareMenu()
	local win = Kit.window(gui, "💾 " .. S.t("bench_usb"), Vector2.new(440, 380))
	local list = Kit.list(win.content)
	for _, prog in { "memtest", "smart", "antivirus", "os_install", "bios_update" } do
		local _, right = Kit.row(list, "💾", S.t("sw_" .. prog), nil)
		Kit.button(right, "▶", function()
			win.close()
			local secs = Config.SoftwareSeconds[prog] or 4
			BenchViews.monitor(active.model, S.t("sw_" .. prog) .. "\n\n" .. S.t("loading"), Color3.fromRGB(0, 40, 90))
			if holdFor(secs * 0.35, S.t("sw_" .. prog)) then
				send("software", nil, { program = prog }, "usb_boot")
			end
		end, { Size = UDim2.fromOffset(60, 36) }, "primary")
	end
end

function build()
	ui.lang = S.lang()
	ui.diag = {}
	local root = Kit.frame(gui, { Name = "Bench", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), Visible = false })
	ui.root = root
	-- top bar
	local top = Kit.panel(root, { Size = UDim2.new(0, 640, 0, 46), Position = UDim2.new(0.5, 0, 0, 12), AnchorPoint = Vector2.new(0.5, 0), BackgroundTransparency = 0.1 })
	ui.title = Kit.label(top, "", { Size = UDim2.new(0.5, 0, 1, 0), Position = UDim2.fromOffset(14, 0), FontFace = Theme.heavy, TextSize = 20 })
	ui.money = Kit.label(top, "", { Size = UDim2.new(0.2, 0, 1, 0), Position = UDim2.new(0.34, 0, 0, 0), TextColor3 = Theme.money, FontFace = Theme.heavy, TextSize = 20 })
	ui.labelBtn = Kit.button(top, "🏷 " .. S.t("bench_labels"), function()
		BenchController.setLabels(not labelsOn)
	end, { Size = UDim2.fromOffset(112, 34), Position = UDim2.new(1, -228, 0, 6), TextSize = 14 }, "ghost")
	Kit.button(top, S.t("bench_leave"), function()
		Net.request("bench.leave")
		exit()
	end, { Size = UDim2.fromOffset(100, 34), Position = UDim2.new(1, -108, 0, 6) }, "bad")

	-- left: job and findings
	local left = Kit.panel(root, { Size = UDim2.new(0, 300, 1, -150), Position = UDim2.fromOffset(12, 70), BackgroundTransparency = 0.12 })
	Kit.padding(left, 10)
	ui.jobInfo = Kit.frame(left, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	Kit.listLayout(ui.jobInfo, 4)
	Kit.label(left, "📝 " .. S.t("bench_notes"), { FontFace = Theme.bold, Size = UDim2.new(1, 0, 0, 22), Position = UDim2.new(0, 0, 0.42, 0) })
	ui.log = Kit.list(left, { Size = UDim2.new(1, 0, 0.58, -26), Position = UDim2.new(0, 0, 0.42, 24) }, 4)

	-- right: tests and finishing
	local right = Kit.panel(root, { Size = UDim2.new(0, 210, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, Position = UDim2.new(1, -222, 0, 70), BackgroundTransparency = 0.12 })
	Kit.padding(right, 10)
	Kit.listLayout(right, 6)
	diagButton(right, "power", "⏻ " .. S.t("bench_power"), function()
		send("press_power", nil, nil, "hand")
	end)
	diagButton(right, "stress", "🔥 " .. S.t("bench_stress"), function()
		if holdFor(1.5, S.t("bench_stress")) then
			send("stress", nil, nil, "hand")
		end
	end)
	diagButton(right, "post", "🃏 " .. S.t("bench_post"), function()
		send("post_code", nil, nil, "post_card")
	end, "post_card", "desktop")
	diagButton(right, "psu", "🔌 " .. S.t("bench_psu"), function()
		send("psu_test", nil, nil, "psu_tester")
	end, "psu_tester", "desktop")
	diagButton(right, "thermal", "🌡️ " .. S.t("bench_thermal"), function()
		send("thermal_view", nil, nil, "thermal_camera")
	end, "thermal_camera")
	diagButton(right, "usb", "💾 " .. S.t("bench_usb"), softwareMenu, "usb_boot")
	ui.strap = diagButton(right, "strap", "📿 " .. S.t("bench_strap"), function()
		local v = view()
		send("wear_strap", nil, { on = not (v and v.strap) }, "esd_strap")
	end, "esd_strap")
	diagButton(right, "flip", "🔄 " .. S.t("bench_flip"), function()
		send("flip", nil, nil, "hand")
	end, nil, "laptop")
	diagButton(right, "lid", "💻 " .. S.t("bench_lid"), function()
		send("lid", nil, nil, "hand")
	end, nil, "laptop")
	diagButton(right, "ties", "🧷 " .. S.t("bench_ties"), function()
		send("tie_cables", nil, nil, "hand")
	end, nil, "desktop")
	ui.unload = Kit.button(right, "📦 " .. S.t("bench_unload"), function()
		local r = Net.request("bench.unload")
		if r.ok then
			active.job = nil
			BenchViews.apply(active.model, nil)
			jobCard()
			refreshDiag()
			showJobPicker()
		end
	end, { Size = UDim2.new(1, 0, 0, 38), TextSize = 15 }, "ghost")
	ui.finish = Kit.button(right, "✅ " .. S.t("bench_finish"), function()
		local r = Net.request("repair.assess")
		local v = r.ok and r.verdict
		local win = Kit.window(gui, "✅ " .. S.t("bench_finish"), Vector2.new(460, 300))
		local body = Kit.frame(win.content, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, -50) })
		Kit.listLayout(body, 6)
		Kit.label(body, S.t("bench_finish_q"), { Size = UDim2.new(1, 0, 0, 40) })
		if v and not v.fixed then
			local why = {}
			if not v.assembled then
				table.insert(why, S.t("bench_not_assembled", { n = v.missing }))
			end
			local st = Rules.StageText[v.stage]
			if v.stage ~= "ok" and st then
				table.insert(why, S.pick(st))
			end
			for _, k in v.issues or {} do
				local it = Rules.IssueText[k]
				table.insert(why, if it then S.pick(it) else k)
			end
			Kit.label(body, "⚠️ " .. table.concat(why, "\n⚠️ "), { TextColor3 = Theme.warn, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 14 })
		elseif v then
			Kit.label(body, "👍 " .. S.t("bench_verdict_ok"), { TextColor3 = Theme.good })
		end
		Kit.button(win.content, S.t("confirm"), function()
			win.close()
			local f = Net.request("repair.finish")
			if not f.ok then
				hud.toast(S.err(f.err), "bad")
				return
			end
			if f.kept and f.kept > 0 then
				hud.toast(S.t("bench_kept", { n = f.kept }), "good")
			end
			if f.verdict.fixed then
				hud.toast(if f.own then S.t("bench_resale", { price = S.money(f.resale or 0) }) else S.t("bench_verdict_ok"), "good", 6)
			else
				hud.toast(S.t("bench_verdict_bad", { why = (Rules.StageText[f.verdict.stage] and S.pick(Rules.StageText[f.verdict.stage])) or f.verdict.stage }), "bad", 6)
			end
			active.job = nil
			BenchViews.apply(active.model, nil)
			jobCard()
			refreshDiag()
			showJobPicker()
		end, { Size = UDim2.new(0.48, 0, 0, 40), Position = UDim2.new(0, 0, 1, -42) }, "good")
		Kit.button(win.content, S.t("cancel"), function()
			win.close()
		end, { Size = UDim2.new(0.48, 0, 0, 40), Position = UDim2.new(0.52, 0, 1, -42) }, "ghost")
	end, { Size = UDim2.new(1, 0, 0, 42), TextSize = 16 }, "good")

	-- bottom: tools
	local bottom = Kit.panel(root, { Size = UDim2.new(0, 0, 0, 76), AutomaticSize = Enum.AutomaticSize.X, Position = UDim2.new(0.5, 0, 1, -12), AnchorPoint = Vector2.new(0.5, 1), BackgroundTransparency = 0.12 })
	Kit.padding(bottom, 8)
	ui.toolName = Kit.label(bottom, "", { Size = UDim2.new(1, 0, 0, 0), Position = UDim2.fromOffset(0, -30), TextXAlignment = Enum.TextXAlignment.Center, FontFace = Theme.bold, TextStrokeTransparency = 0.5 })
	ui.tools = Kit.frame(bottom, { BackgroundTransparency = 1, Size = UDim2.new(0, 0, 1, 0), AutomaticSize = Enum.AutomaticSize.X })
	Kit.listLayout(ui.tools, 6, true)

	-- hint box: right above the tool bar, where the eyes are
	ui.hint = Kit.panel(root, { Size = UDim2.fromOffset(560, 0), AutomaticSize = Enum.AutomaticSize.Y, Position = UDim2.new(0.5, 0, 1, -98), AnchorPoint = Vector2.new(0.5, 1), BackgroundTransparency = 0.1, Visible = false })
	ui.hintStroke = ui.hint:FindFirstChildOfClass("UIStroke")
	ui.hintStroke.Thickness = 2
	Kit.padding(ui.hint, 8)
	ui.hintText = Kit.label(ui.hint, "", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextXAlignment = Enum.TextXAlignment.Center, TextSize = 16 })

	-- hold progress
	ui.hold = Kit.panel(root, { Size = UDim2.fromOffset(340, 64), Position = UDim2.new(0.5, 0, 0.62, 0), AnchorPoint = Vector2.new(0.5, 0.5), Visible = false })
	Kit.padding(ui.hold, 10)
	ui.holdLabel = Kit.label(ui.hold, "", { TextXAlignment = Enum.TextXAlignment.Center, FontFace = Theme.bold })
	ui.holdBar = Kit.progress(ui.hold, { Position = UDim2.fromOffset(0, 28), Size = UDim2.new(1, 0, 0, 12) }, Theme.accent2)

	-- thermal paste meter
	ui.paste = Kit.panel(root, { Size = UDim2.fromOffset(420, 90), Position = UDim2.new(0.5, 0, 0.62, 0), AnchorPoint = Vector2.new(0.5, 0.5), Visible = false })
	Kit.padding(ui.paste, 10)
	ui.pasteText = Kit.label(ui.paste, "", { TextXAlignment = Enum.TextXAlignment.Center, FontFace = Theme.bold })
	local track = Kit.frame(ui.paste, { Size = UDim2.new(1, 0, 0, 22), Position = UDim2.fromOffset(0, 30), BackgroundColor3 = Theme.bg })
	Kit.corner(track, UDim.new(0, 6))
	ui.pasteZone = Kit.frame(track, { BackgroundColor3 = Theme.good, BackgroundTransparency = 0.5 })
	ui.pasteFill = Kit.frame(track, { BackgroundColor3 = Color3.fromRGB(170, 172, 180), Size = UDim2.fromScale(0, 1), BackgroundTransparency = 0.15 })
	Kit.corner(ui.pasteFill, UDim.new(0, 6))
	Kit.label(ui.paste, S.t("paste_hint"), { Position = UDim2.fromOffset(0, 56), TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Theme.dim, TextSize = 14 })

	-- job picker (when the bench is empty)
	ui.pickerFrame = Kit.panel(root, { Size = UDim2.fromOffset(560, 420), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), Visible = false })
	Kit.padding(ui.pickerFrame, 12)
	Kit.label(ui.pickerFrame, "🧰 " .. S.t("bench_pick"), { FontFace = Theme.heavy, TextSize = 20, Size = UDim2.new(1, 0, 0, 30) })
	ui.picker = Kit.list(ui.pickerFrame, { Size = UDim2.new(1, 0, 1, -40), Position = UDim2.fromOffset(0, 38) })

	highlight = Instance.new("Highlight")
	highlight.Name = "BenchHover"
	highlight.FillTransparency = 0.82
	highlight.FillColor = Color3.fromRGB(120, 220, 255)
	highlight.OutlineTransparency = 0
	highlight.DepthMode = Enum.HighlightDepthMode.Occluded
	highlight.Parent = gui

	BenchCoach.init(root, {
		view = view,
		handle = handle,
		nodeLabel = nodeLabel,
		owns = State.owns,
		selectTool = selectTool,
		active = function()
			return active ~= nil
		end,
		diagButton = function(id: string)
			return ui.diag[id]
		end,
	})
end

----------------------------------------------------------------------------------------------------
function BenchController.init(screen: ScreenGui, hudModule)
	gui = screen
	hud = hudModule
	build()
	BenchController.acted:Connect(BenchCoach.onActed)
	Net.on("bench.open", enter)
	Net.on("bench.close", function()
		exit()
	end)

	UserInputService.InputBegan:Connect(function(input, processed)
		if not active then
			return
		end
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseButton2 then
			dragging = true
			dragMoved = 0
			return
		end
		if processed then
			return
		end
		if t == Enum.UserInputType.Touch then
			-- a second tap ends the thermal paste squeeze; otherwise wait: tap acts, drag turns
			if holding and holding.paste then
				holding = nil
				return
			end
			touchStart = Vector2.new(input.Position.X, input.Position.Y)
			dragMoved = 0
			return
		end
		if t == Enum.UserInputType.MouseButton1 then
			if hover and hover.id and not Kit.currentWindow() then
				if hover.c and hover.ok then
					task.spawn(perform, hover.id, hover.c, toolId)
				else
					-- the hint already says why; offer everything that is possible instead
					task.spawn(nodeMenu, hover.id)
				end
			end
		elseif t == Enum.UserInputType.Keyboard then
			local k = input.KeyCode
			if k == Enum.KeyCode.Q then
				orbit.yaw -= 0.25
			elseif k == Enum.KeyCode.E then
				orbit.yaw += 0.25
			elseif k == Enum.KeyCode.R then
				orbit.yaw, orbit.pitch, orbit.dist = CAM_START.yaw, CAM_START.pitch, CAM_START.dist
				orbit.offT = Vector3.zero
			elseif k == Enum.KeyCode.L then
				BenchController.setLabels(not labelsOn)
			else
				local digits = { [Enum.KeyCode.One] = "1", [Enum.KeyCode.Two] = "2", [Enum.KeyCode.Three] = "3", [Enum.KeyCode.Four] = "4", [Enum.KeyCode.Five] = "5", [Enum.KeyCode.Six] = "6", [Enum.KeyCode.Seven] = "7", [Enum.KeyCode.Eight] = "8", [Enum.KeyCode.Nine] = "9", [Enum.KeyCode.Zero] = "0" }
				local d = digits[k]
				if d then
					for id, b in ui.toolButtons do
						if b:GetAttribute("Key") == d then
							selectTool(id)
						end
					end
				end
			end
		end
	end)
	UserInputService.InputEnded:Connect(function(input)
		if not active then
			return
		end
		local t = input.UserInputType
		if t == Enum.UserInputType.Touch then
			-- a tap (not a drag) acts on the part under the finger; holds then run on their own
			local start = touchStart
			touchStart = nil
			if start and dragMoved < 12 and not Kit.currentWindow() and not holding then
				updateHover(Vector2.new(input.Position.X, input.Position.Y) + GuiService:GetGuiInset())
				if hover and hover.id then
					if hover.c and hover.ok then
						task.spawn(perform, hover.id, hover.c, toolId)
					else
						task.spawn(nodeMenu, hover.id)
					end
				end
			end
		elseif t == Enum.UserInputType.MouseButton1 then
			if holding and holding.t0 then
				local f = (os.clock() - holding.t0) / holding.dur
				if holding.paste then
					holding = nil -- release = stop squeezing
				elseif f < 1 then
					holding.cancelled = true
				end
			end
		elseif t == Enum.UserInputType.MouseButton2 then
			dragging = false
			if dragMoved < 6 and hover and hover.id and not Kit.currentWindow() then
				task.spawn(nodeMenu, hover.id)
			end
		end
	end)
	UserInputService.InputChanged:Connect(function(input)
		if not active then
			return
		end
		local turning = (input.UserInputType == Enum.UserInputType.MouseMovement and dragging) or (input.UserInputType == Enum.UserInputType.Touch and touchStart ~= nil)
		if turning then
			dragMoved += math.abs(input.Delta.X) + math.abs(input.Delta.Y)
			orbit.yaw -= input.Delta.X * 0.008
			orbit.pitch = math.clamp(orbit.pitch + input.Delta.Y * 0.006, 0.15, 1.45)
		elseif input.UserInputType == Enum.UserInputType.MouseWheel then
			local dir = input.Position.Z
			orbit.dist = math.clamp(orbit.dist - dir * 0.5, 1.4, 12)
			local root = active and BenchViews.rootOf(active.model)
			if dir > 0 and hover and hover.pos and root then
				-- zooming in: the part under the mouse drifts to the middle of the view
				local local3 = root:PointToObjectSpace(hover.pos) - CAM_FOCUS
				orbit.offT = orbit.offT:Lerp(local3, 0.3)
				if orbit.offT.Magnitude > 3.2 then
					orbit.offT = orbit.offT.Unit * 3.2
				end
			elseif dir < 0 then
				orbit.offT = orbit.offT * 0.7
			end
		end
	end)
	UserInputService.TouchPinch:Connect(function(_, scale, _, state)
		if active and state == Enum.UserInputState.Change then
			orbit.dist = math.clamp(orbit.dist / scale, 1.4, 12)
		end
	end)
end

function BenchController.setLabels(on: boolean)
	labelsOn = on
	if ui.labelBtn then
		ui.labelBtn.Text = (if on then "🏷 " else "🚫 ") .. S.t("bench_labels")
	end
	refreshLabels()
end

function BenchController.labelsOn(): boolean
	return labelsOn
end

function BenchController.active(): boolean
	return active ~= nil
end

-- tests: drive the bench without input
BenchController._candidates = candidates
BenchController._resolve = resolve
BenchController._view = view
function BenchController._act(id: string, tid: string)
	local v = view()
	local c, ok = resolve(v, id, tid)
	if c and ok then
		perform(id, c, tid)
	end
	return c, ok
end

return BenchController
