-- BenchCoach: a teacher at your elbow for people who have never opened a computer.
--
-- A card at the top of the bench screen always says what to do next, in plain words:
--   1. Test the machine (Power) and look at what it does,
--   2. read what that symptom usually means and which parts to suspect,
--   3. open the case, find the fault (hints: where is it / what is the next click),
--   4. put everything back, test again, press Finish.
-- The "next click" hint is worked out on the server from the device's real fault (the same planner
-- the hired technicians use): it names the tool and the part, picks the tool for you and points at
-- the part with a bobbing arrow. Hints are free while you are learning (your first five repairs)
-- and cost a share of the pay afterwards. Settings → Help: Guided / Hints only / Off.

local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Rules = require(Shared.Repair.RepairRules)
local Tools = require(Shared.Data.Tools)
local Glossary = require(Shared.Data.Glossary)

local Client = script.Parent.Parent
local Kit = require(Client.UI.Kit)
local Theme = require(Client.UI.Theme)
local S = require(Client.Strings)
local State = require(Client.State)

local BenchCoach = {}

local function T(en: string, tr: string)
	return { en = en, tr = tr }
end

local TXT = {
	test_title = T("Step 1 — Test it", "Adım 1 — Test et"),
	test = T("Press ⏻ Power on the right and watch the monitor and the fans. What the machine does tells you what is wrong.", "Sağdaki ⏻ Güç düğmesine bas; monitöre ve fanlara bak. Cihazın ne yaptığı, neyin bozuk olduğunu söyler."),
	read_title = T("Step 2 — What you saw", "Adım 2 — Gördüğün"),
	diag_title = T("Step 3 — Find the fault", "Adım 3 — Arızayı bul"),
	diag = T("Open the machine up and look. Hover a part to read what it is. Not sure where to start? Ask for a hint.", "Cihazı aç ve bak. Bir parçanın üzerine gelince ne olduğu yazar. Nereden başlayacağını bilmiyorsan ipucu iste."),
	suspects = T("Look at: {list}.", "Şunlara bak: {list}."),
	fix_title = T("Step 4 — Fix it", "Adım 4 — Onar"),
	back_title = T("Step 5 — Put it back together", "Adım 5 — Geri tak"),
	back = T("Everything must go back: {list}. Fit the parts, tighten the screws, close the case.", "Her şey yerine takılmalı: {list}. Parçaları tak, vidaları sık, kapağı kapat."),
	verify_title = T("Step 6 — Test again", "Adım 6 — Tekrar test et"),
	verify = T("Press ⏻ Power again (and the Stress test 🔥). If it runs fine, press ✅ Finish Job.", "Tekrar ⏻ Güç'e bas (bir de Stres testi 🔥). Düzgün çalışıyorsa ✅ İşi Bitir'e bas."),
	done_title = T("Looks good", "İyi görünüyor"),
	hint_where = T("💡 Where's the problem?", "💡 Sorun nerede?"),
	hint_next = T("👉 Show the next step", "👉 Sıradaki adımı göster"),
	hint_free = T("Free while you're learning", "Öğrenirken ücretsiz"),
	hint_cost = T("Step hints cost 8% of the pay", "Adım ipuçları ücretin %8'ini götürür"),
	where_is = T("The problem is with: {list}.", "Sorun şunlarda: {list}."),
	nothing = T("Nothing is wrong with the parts any more. Put everything back and test.", "Parçalarda sorun kalmadı. Her şeyi geri tak ve test et."),
	use_tool = T("Use {tool} on {part}: {what}.", "{part} için {tool} kullan: {what}."),
	need_tool = T("You need {tool} for this: buy it at the tool shop.", "Bunun için {tool} gerekli: alet dükkânından al."),
	put_back = T("Put {part} back in.", "{part} parçasını geri tak."),
	need_part = T("This part is faulty: you need a working replacement. Buy one at the parts store, or take one from your inventory.", "Bu parça arızalı: çalışan bir yenisi gerek. Parça mağazasından al ya da envanterinden kullan."),
	hide = T("Hide", "Gizle"),
	hints_pill = T("💡 Coach", "💡 Koç"),
}

local ACTION_WHAT = {
	unscrew = T("undo it", "sök"),
	screw = T("screw it back in", "geri sık"),
	remove = T("take it out", "çıkar"),
	install = T("put it in", "tak"),
	open_latch = T("open the clip", "klipsi aç"),
	close_latch = T("close the clip", "klipsi kapat"),
	unplug = T("unplug it", "çıkar"),
	plug = T("plug it in firmly", "sıkıca tak"),
	pry = T("pry it open", "kaldırarak aç"),
	peel = T("peel it off", "sök"),
	blow_dust = T("blow the dust out", "tozunu üfle"),
	brush = T("brush the dust off", "tozunu fırçala"),
	straighten_pins = T("straighten the bent pins", "eğik pinleri düzelt"),
	apply_paste = T("apply fresh thermal paste", "yeni termal macun sür"),
	clean_paste = T("clean off the old paste", "eski macunu temizle"),
	clean_liquid = T("clean the liquid damage", "sıvı hasarını temizle"),
	desolder = T("desolder it", "lehimini çöz"),
	solder = T("solder it in", "lehimle"),
	software = T("run the software tool (💾)", "yazılım aracını çalıştır (💾)"),
	inspect = T("look closely", "yakından incele"),
	measure = T("measure it", "ölç"),
}

local api = nil :: any
local root: Frame
local card: Frame
local stepLbl: TextLabel
local bodyLbl: TextLabel
local noteLbl: TextLabel
local whereBtn: TextButton
local nextBtn: TextButton
local pill: TextButton
local folder: Folder
local pointers = {} :: { { anchor: Part, gui: BillboardGui, id: string } }
local uiPointer: UIStroke? = nil
local stepConn: RBXScriptConnection? = nil

local st = {
	jobId = nil :: string?,
	stage = nil :: string?,
	powered = false,
	opened = false, -- the case was opened (something was out or loose at some point)
	hint = nil :: any, -- the last answer of repair.hint
	follow = false, -- keep re-asking after every action
	expanded = false, -- "hints only" mode: the card is open
	busyAsk = false,
}

local function help(): string
	local s = State.data and State.data.settings
	local h = s and s.help
	if h == "guided" or h == "hints" or h == "off" then
		return h
	end
	local repairs = State.data and State.data.stats and State.data.stats.repairs or 0
	return if repairs < 5 then "guided" else "hints"
end
BenchCoach.help = help

local function learning(): boolean
	local repairs = State.data and State.data.stats and State.data.stats.repairs or 0
	return repairs < 5
end

local function listOf(ids: { string }, v): string
	local names = {}
	for _, id in ids do
		local tn = Rules.tnode(v, id)
		if tn and Rules.available(v, id) then
			table.insert(names, api.nodeLabel(v, id))
		end
	end
	return table.concat(names, ", ")
end

----------------------------------------------------------------------------------------------------
-- Pointers: a bobbing arrow over each node the coach talks about
----------------------------------------------------------------------------------------------------
local function clearPointers()
	for _, p in pointers do
		p.anchor:Destroy()
	end
	table.clear(pointers)
end

local function point(ids: { string })
	clearPointers()
	local h = api.handle()
	if not h then
		return
	end
	for i, id in ids do
		if i > 4 then
			break
		end
		local rec = h.recs[id]
		if rec and rec.model then
			local a = Instance.new("Part")
			a.Name = "CoachPointer"
			a.Size = Vector3.new(0.2, 0.2, 0.2)
			a.Transparency = 1
			a.Anchored = true
			a.CanCollide = false
			a.CanQuery = false
			a.CanTouch = false
			a.CastShadow = false
			a.Parent = folder
			local g = Instance.new("BillboardGui")
			g.Adornee = a
			g.AlwaysOnTop = true
			g.Size = UDim2.fromOffset(46, 46)
			g.LightInfluence = 0
			g.MaxDistance = 40
			g.Parent = a
			local arrow = Kit.label(g, "⬇", { Size = UDim2.fromScale(1, 1), TextSize = 40, TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Color3.fromRGB(255, 214, 64), TextStrokeTransparency = 0 })
			arrow.TextScaled = false
			table.insert(pointers, { anchor = a, gui = g, id = id })
		end
	end
end

local function updatePointers()
	local h = api and api.handle()
	if not h or #pointers == 0 then
		return
	end
	local bob = math.sin(os.clock() * 5) * 0.12
	for _, p in pointers do
		local rec = h.recs[p.id]
		local m = rec and rec.model
		if m and m.Parent then
			p.anchor.Position = m:GetPivot().Position + Vector3.new(0, 0.9 + bob, 0)
		end
	end
end

-- A glowing outline on one of the bench panel's buttons ("press this").
local function pointUi(button: GuiObject?)
	if uiPointer then
		uiPointer:Destroy()
		uiPointer = nil
	end
	if button then
		local s = Instance.new("UIStroke")
		s.Name = "CoachPointer"
		s.Color = Color3.fromRGB(255, 214, 64)
		s.Thickness = 3
		s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
		s.Parent = button
		uiPointer = s
	end
end

----------------------------------------------------------------------------------------------------
-- The card
----------------------------------------------------------------------------------------------------
local function setCard(title: string, body: string, note: string?)
	stepLbl.Text = title
	bodyLbl.Text = body
	noteLbl.Text = note or ""
	noteLbl.Visible = note ~= nil and note ~= ""
end

-- Fills {name} placeholders (one string back, whatever gsub returns).
local function fill(text: string, vars: { [string]: string }): string
	local out = string.gsub(text, "{(%w+)}", function(k)
		return vars[k] or ""
	end)
	return out
end

local function toolName(id: string): string
	local t = Tools.get(id)
	return if t then (t.icon or "") .. " " .. S.pick(t.name) else id
end

-- What the coach says now, from the device's state and what it has been told.
local function phaseOf(v)
	if (v.tests or 0) == 0 and not st.powered then
		return "test"
	end
	local assembled, missing = Rules.assembled(v)
	if not assembled then
		st.opened = true
	end
	if st.hint and st.hint.level == 3 then
		if st.hint.next then
			return "step", missing
		end
		-- nothing left to fix
		return (if assembled then "verify" else "back"), missing
	end
	if st.opened and assembled and not st.hint then
		return "verify", missing
	end
	if st.stage and not st.opened and not st.hint then
		return "read", missing
	end
	return "diag", missing
end

function BenchCoach.refresh()
	if not card then
		return
	end
	local mode = help()
	local v = api and api.view()
	if mode == "off" or not v or not api.active() then
		card.Visible = false
		pill.Visible = false
		clearPointers()
		pointUi(nil)
		return
	end
	-- "hints only": a small pill that opens the card
	if mode == "hints" and not st.expanded then
		card.Visible = false
		pill.Visible = true
		pill.Text = S.pick(TXT.hints_pill)
		pointUi(nil)
		return
	end
	pill.Visible = false
	card.Visible = true
	local phase, missing = phaseOf(v)
	local show = { where = true, next = true }
	local pointIds: { string } = {}
	local uiButton: GuiObject? = nil
	if phase == "test" then
		setCard(S.pick(TXT.test_title), S.pick(TXT.test))
		uiButton = api.diagButton("power")
		show.where, show.next = false, false
	elseif phase == "read" then
		local sym = Glossary.symptoms[st.stage]
		local body = if sym then "<b>" .. S.pick(sym.see) .. "</b>\n" .. S.pick(sym.means) else S.pick(TXT.diag)
		local note = nil
		if sym and #sym.suspects > 0 then
			local list = listOf(sym.suspects, v)
			if list ~= "" then
				note = fill(S.pick(TXT.suspects), { list = list })
			end
		end
		setCard(S.pick(TXT.read_title), body, note)
	elseif phase == "step" then
		local nx = st.hint.next
		local tn = Rules.tnode(v, nx.target or "")
		local what = ACTION_WHAT[nx.action]
		local label = if nx.target then api.nodeLabel(v, nx.target) else ""
		local text
		if nx.action == "install" and tn and tn.kind == "comp" and not (nx.args and nx.args.source == "self") then
			text = S.pick(TXT.need_part)
		elseif nx.action == "install" then
			text = fill(S.pick(TXT.put_back), { part = label })
		else
			text = fill(S.pick(TXT.use_tool), { tool = toolName(nx.tool or "hand"), part = label, what = if what then S.pick(what) else nx.action })
		end
		local note = nil
		if nx.tool and not api.owns(nx.tool) then
			note = fill(S.pick(TXT.need_tool), { tool = toolName(nx.tool) })
		end
		setCard(S.pick(TXT.fix_title), text, note)
		if nx.target then
			table.insert(pointIds, nx.target)
		elseif nx.action == "software" then
			uiButton = api.diagButton("usb")
		end
	elseif phase == "back" then
		local ids = {}
		for _, m in missing or {} do
			table.insert(ids, m.id or m.node or m)
		end
		local list = listOf(ids, v)
		setCard(S.pick(TXT.back_title), fill(S.pick(TXT.back), { list = if list ~= "" then list else "—" }))
		for i, id in ids do
			if i <= 3 then
				table.insert(pointIds, id)
			end
		end
		show.where = false
	elseif phase == "verify" then
		setCard(S.pick(TXT.verify_title), S.pick(TXT.verify))
		uiButton = api.diagButton("power")
		show.where, show.next = false, false
	else
		local body = S.pick(TXT.diag)
		local culprits = st.hint and st.hint.culprits
		local note = nil
		if culprits and #culprits > 0 then
			local list = listOf(culprits, v)
			if list ~= "" then
				note = fill(S.pick(TXT.where_is), { list = list })
			end
			for i, id in culprits do
				if i <= 3 then
					table.insert(pointIds, id)
				end
			end
		end
		setCard(S.pick(TXT.diag_title), body, note)
	end
	whereBtn.Visible = show.where
	nextBtn.Visible = show.next
	local cost = if learning() then S.pick(TXT.hint_free) else S.pick(TXT.hint_cost)
	nextBtn.Text = S.pick(TXT.hint_next) .. "  (" .. cost .. ")"
	whereBtn.Text = S.pick(TXT.hint_where)
	point(pointIds)
	pointUi(uiButton)
end

-- Ask the server (level 2: which parts; level 3: the next click).
function BenchCoach.ask(level: number)
	if st.busyAsk or not api.active() then
		return
	end
	st.busyAsk = true
	local r = Net.request("repair.hint", { level = level })
	st.busyAsk = false
	if not r.ok then
		return
	end
	st.hint = r
	st.follow = level >= 3
	if r.next and r.next.tool and api.owns(r.next.tool) then
		api.selectTool(r.next.tool)
	end
	BenchCoach.refresh()
end

-- The device was changed (a part came out, a screw went in...): the old hint is stale.
function BenchCoach.onActed(_action: string, result)
	if result and result.eval and result.eval.stage then
		st.stage = result.eval.stage
		st.powered = true
	end
	if st.follow and help() ~= "off" then
		task.spawn(function()
			task.wait(0.15)
			BenchCoach.ask(3)
		end)
	else
		st.hint = nil
		BenchCoach.refresh()
	end
end

-- A different job (or none) is on the bench.
function BenchCoach.reset(jobId: string?)
	if st.jobId ~= jobId then
		st = { jobId = jobId, stage = nil, powered = false, opened = false, hint = nil, follow = false, expanded = false, busyAsk = false }
	end
	BenchCoach.refresh()
end

-- tests
function BenchCoach._state()
	return st
end
function BenchCoach._card()
	return card
end

function BenchCoach.leave()
	clearPointers()
	pointUi(nil)
	if card then
		card.Visible = false
		pill.Visible = false
	end
end

-- (called again when the bench UI is rebuilt after a language change)
function BenchCoach.init(parent: Frame, bench)
	api = bench
	root = parent
	if folder then
		folder:Destroy()
	end
	table.clear(pointers)
	folder = Instance.new("Folder")
	folder.Name = "BenchCoach"
	folder.Parent = Workspace

	card = Kit.panel(root, { Name = "Coach", Size = UDim2.fromOffset(540, 0), AutomaticSize = Enum.AutomaticSize.Y, Position = UDim2.new(0.5, 0, 0, 66), AnchorPoint = Vector2.new(0.5, 0), BackgroundTransparency = 0.04, Visible = false })
	Kit.outline(card, Theme.accent2, 2, 0)
	Kit.padding(card, 10)
	Kit.listLayout(card, 5)
	stepLbl = Kit.label(card, "", { Size = UDim2.new(1, -70, 0, 18), TextSize = 13, FontFace = Theme.bold, TextColor3 = Theme.accent2, LayoutOrder = 1 })
	bodyLbl = Kit.label(card, "", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 16, FontFace = Theme.bold, TextWrapped = true, LayoutOrder = 2 })
	bodyLbl.RichText = true
	noteLbl = Kit.label(card, "", { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 14, TextColor3 = Theme.warn, TextWrapped = true, LayoutOrder = 3 })
	local row = Kit.frame(card, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 34), LayoutOrder = 4 })
	Kit.listLayout(row, 8, true)
	whereBtn = Kit.button(row, "", function()
		BenchCoach.ask(2)
	end, { Name = "CoachWhere", Size = UDim2.fromOffset(190, 32), TextSize = 14, LayoutOrder = 1 }, "ghost")
	nextBtn = Kit.button(row, "", function()
		BenchCoach.ask(3)
	end, { Name = "CoachNext", Size = UDim2.fromOffset(310, 32), TextSize = 13, LayoutOrder = 2 }, "primary")
	Kit.button(card, "✕", function()
		st.expanded = false
		st.follow = false
		if help() == "guided" then
			-- hiding the card means "hints only" for now
			if State.data then
				State.data.settings = State.data.settings or {}
				State.data.settings.help = "hints"
			end
			Net.request("settings.set", { help = "hints" })
		end
		BenchCoach.refresh()
	end, { Size = UDim2.fromOffset(28, 24), Position = UDim2.new(1, -28, 0, 0), TextSize = 13 }, "ghost")

	pill = Kit.button(root, "", function()
		st.expanded = true
		BenchCoach.refresh()
	end, { Name = "CoachPill", Size = UDim2.fromOffset(120, 34), Position = UDim2.new(0.5, 0, 0, 66), AnchorPoint = Vector2.new(0.5, 0), TextSize = 15, Visible = false }, "primary")

	if stepConn then
		stepConn:Disconnect()
	end
	stepConn = RunService.RenderStepped:Connect(updatePointers)
end

return BenchCoach
