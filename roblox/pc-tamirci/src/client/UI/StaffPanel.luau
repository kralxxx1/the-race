-- StaffPanel: the staff agency and your team. Six places to find people (tabs), a filter by kind
-- of job, candidate CVs with an interview that shows the truth (real stars, the hidden trait,
-- what they say), and your team with stars, morale, raises and severance.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Employees = require(Shared.Data.Employees)
local Upgrades = require(Shared.Data.Upgrades)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local StaffPanel = {}

-- the agency window while it's open: { win, payload, fill }
local agency = nil

local function traitName(id: string?): string?
	local t = id and Employees.traitById[id]
	return if t then S.pick(t.name) else nil
end

local function moraleFace(m: number): string
	return if m >= 80 then "😄" elseif m >= 60 then "🙂" elseif m >= 40 then "😐" elseif m >= 20 then "😟" else "😠"
end

local function capacityText(): string
	local d = State.data
	if not d then
		return ""
	end
	local lvl = Upgrades.level(d.shop.level)
	return S.t("staff_capacity", { n = #d.staff, m = lvl.staff })
end

-- One line about an employee: stars, the traits you know, morale, pay, days at work.
local function personSub(e): string
	local traits = { traitName(e.trait) }
	-- the second trait shows at the interview, or after a few days at work
	if e.known or (e.days or 0) >= 3 then
		table.insert(traits, traitName(e.trait2))
	end
	local m = Employees.moraleOf(e)
	local parts = { S.stars(e.skill or 1), table.concat(traits, ", "), moraleFace(m) .. " " .. S.t("staff_morale", { n = math.floor(m) }), S.t("staff_day_wage", { wage = S.money(e.wage or 0) }) }
	if (e.skill or 1) < 5 then
		table.insert(parts, S.t("staff_xp", { p = math.floor((e.xp or 0) / Employees.xpNeeded(e.skill or 1) * 100) }))
	end
	return table.concat(parts, "  •  ")
end

-- One card per employee: who, how they're doing, a raise or the door.
local function teamCard(list: Instance, e, order: number)
	local role = Employees.roles[e.role]
	local f = Kit.panel(list, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = Theme.card, LayoutOrder = order })
	Kit.padding(f, 8)
	Kit.listLayout(f, 4)
	local title = (role and role.icon or "🧑") .. "  <b>" .. Kit.esc(e.name) .. "</b>  —  " .. (role and S.pick(role.name) or e.role)
	if role and role.spot == nil and not role.bench then
		title ..= "  " .. S.t("staff_remote")
	end
	Kit.label(f, title, { LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 22), TextSize = 15, TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
	Kit.label(f, personSub(e), { LayoutOrder = 2, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 13, TextColor3 = Theme.dim })
	local buttons = Kit.frame(f, { LayoutOrder = 3, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 30) })
	Kit.listLayout(buttons, 6, true)
	Kit.button(buttons, S.t("staff_raise"), function()
		local r = Net.request("staff.raise", { uid = e.uid })
		App.report(r, if r.ok then S.t("staff_raised", { name = e.name, wage = S.money(r.wage or 0) }) else nil)
	end, { Size = UDim2.new(0.42, -3, 1, 0), TextSize = 13, LayoutOrder = 1 }, "ghost")
	local sev = Employees.severance(e)
	Kit.button(buttons, if sev > 0 then S.t("staff_fire_pay", { price = S.money(sev) }) else S.t("staff_fire"), function()
		local r = Net.request("staff.fire", { uid = e.uid })
		App.report(r, S.t("staff_fired", { name = e.name }))
	end, { Size = UDim2.new(0.58, -3, 1, 0), TextSize = 13, LayoutOrder = 2 }, "bad")
end

local function teamList(list: ScrollingFrame)
	Kit.clear(list)
	local staff = State.data and State.data.staff or {}
	for i, e in staff do
		teamCard(list, e, i)
	end
	if #staff == 0 then
		Kit.label(list, S.t("staff_none"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
	end
end

-- Why a place won't deal with you yet ("" when it will).
local function lockText(ch): string
	local d = State.data
	if not d then
		return ""
	end
	if d.shop.level < (ch.minShop or 1) then
		return S.t("staff_lock_shop", { n = ch.minShop })
	end
	if #d.staff < (ch.needStaff or 0) then
		return S.t("staff_lock_staff")
	end
	return ""
end

local function candidateCard(parent: Instance, cand, order: number)
	local d = State.data
	local role = Employees.roles[cand.role]
	local edu = Employees.eduById[cand.edu or ""]
	local f = Kit.panel(parent, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = Theme.card, LayoutOrder = order })
	Kit.padding(f, 10)
	local inner = Kit.frame(f, { BackgroundTransparency = 1, Size = UDim2.new(1, -170, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	Kit.listLayout(inner, 2)
	local head = (role and role.icon or "🧑") .. " <b>" .. Kit.esc(cand.name) .. "</b>  —  " .. (role and S.pick(role.name) or cand.role)
	if role and role.spot == nil and not role.bench then
		head ..= "  " .. S.t("staff_remote")
	end
	Kit.label(inner, head, { LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 22) })
	local bioKey = if (cand.years or 0) > 0 then "staff_bio" else "staff_bio_new"
	Kit.label(inner, S.t(bioKey, { age = cand.age or "?", town = cand.town or "", edu = edu and S.pick(edu.name) or "", years = cand.years or 0 }), { LayoutOrder = 2, TextColor3 = Theme.dim, TextSize = 13, Size = UDim2.new(1, 0, 0, 18) })
	local line
	if cand.interviewed then
		local honest = cand.skill >= (cand.cvSkill or cand.skill)
		line = S.t("staff_real", { stars = S.stars(cand.skill) }) .. (if honest then " ✔" else "  (" .. S.t("staff_cv", { stars = S.stars(cand.cvSkill or 0) }) .. ")") .. "  •  " .. (traitName(cand.trait) or "") .. ", " .. (traitName(cand.trait2) or "")
		Kit.label(inner, line, { LayoutOrder = 3, TextColor3 = if honest then Theme.good else Theme.bad, TextSize = 14, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
		local t2 = Employees.traitById[cand.trait2 or ""]
		local t1 = Employees.traitById[cand.trait or ""]
		local says = (t2 and t2.say) or (t1 and t1.say)
		if says then
			Kit.label(inner, "<i>“" .. Kit.esc(S.pick(says)) .. "”</i>", { LayoutOrder = 4, TextColor3 = Theme.text, TextSize = 13, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
		end
	else
		line = S.t("staff_cv", { stars = S.stars(cand.cvSkill or 1) }) .. "  •  " .. (traitName(cand.trait) or "") .. "  •  " .. S.t("staff_hidden")
		Kit.label(inner, line, { LayoutOrder = 3, TextColor3 = Theme.warn, TextSize = 14, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	end
	if role then
		Kit.label(inner, S.pick(role.desc), { LayoutOrder = 5, TextColor3 = Theme.dim, TextSize = 13, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	end
	-- the right column: pay, interview, hire
	local side = Kit.frame(f, { BackgroundTransparency = 1, Size = UDim2.new(0, 160, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, Position = UDim2.new(1, -160, 0, 0) })
	Kit.listLayout(side, 6)
	Kit.label(side, S.t("staff_day_wage", { wage = S.money(cand.wage or 0) }), { LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 20), TextColor3 = Theme.money, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Right })
	if not cand.interviewed then
		Kit.button(side, S.t("staff_interview"), function()
			local r = Net.request("staff.interview", { uid = cand.uid })
			if r.ok and r.cand and agency then
				for i, c in agency.payload.candidates do
					if c.uid == r.cand.uid then
						agency.payload.candidates[i] = r.cand
					end
				end
				agency.fill()
			else
				App.report(r)
			end
		end, { LayoutOrder = 2, Size = UDim2.new(1, 0, 0, 32), TextSize = 14 }, "ghost")
	end
	local shopOk = not role or not d or d.shop.level >= (role.minShop or 1)
	local filled = role ~= nil and d ~= nil and Employees.count(d.staff, cand.role) >= role.max
	local full = d ~= nil and #d.staff >= Upgrades.level(d.shop.level).staff
	local text = if not shopOk then S.t("staff_needs_shop", { n = role.minShop }) elseif filled then S.t("staff_filled") elseif full then S.t("staff_full") elseif (cand.hireCost or 0) > 0 then S.t("staff_hire", { price = S.money(cand.hireCost) }) else S.t("staff_hire_free")
	local b = Kit.button(side, text, function()
		local r = Net.request("staff.hire", { uid = cand.uid })
		App.report(r, S.t("staff_hired", { name = cand.name }))
	end, { LayoutOrder = 3, Size = UDim2.new(1, 0, 0, 36), TextSize = if shopOk then 15 else 13 }, "good")
	Kit.setEnabled(b, shopOk and not filled and not full and d ~= nil and d.money >= (cand.hireCost or 0))
end

-- The agency: where to look (tabs), your team on the left, candidates on the right.
function StaffPanel.agency(payload)
	if agency and agency.win.isOpen() then
		agency.payload = payload
		agency.fill()
		return
	end
	local conn
	local win = Kit.window(App.screen :: ScreenGui, "🧑‍💼 " .. S.t("staff_agency"), Vector2.new(1100, 640), function()
		if conn then
			conn:Disconnect()
		end
		agency = nil
	end)
	local c = win.content
	local info = Kit.label(c, "", { Size = UDim2.new(0, 200, 0, 24), FontFace = Theme.bold })
	local chInfo = Kit.label(c, "", { Size = UDim2.new(1, -440, 0, 24), Position = UDim2.fromOffset(205, 0), TextColor3 = Theme.dim, TextSize = 13, TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
	local refresh = Kit.button(c, "", function()
		App.report(Net.request("staff.refresh"))
	end, { Size = UDim2.fromOffset(220, 30), Position = UDim2.new(1, -220, 0, -3), TextSize = 14 }, "ghost")
	local tabs = {}
	for _, ch in Employees.channels do
		table.insert(tabs, { id = ch.id, text = ch.icon .. " " .. S.pick(ch.name) })
	end
	local selecting = false
	local channelTabs = Kit.tabs(c, tabs, function(id)
		if not selecting and agency and agency.payload.channel ~= id then
			task.spawn(Net.request, "staff.channel", { id = id })
		end
	end, { Position = UDim2.fromOffset(0, 32) })
	for _, b in channelTabs.buttons do
		b.TextSize = 14
	end
	Kit.label(c, S.t("staff_yours"), { Size = UDim2.new(0.36, 0, 0, 22), Position = UDim2.fromOffset(0, 74), TextColor3 = Theme.dim })
	local team = Kit.list(c, { Size = UDim2.new(0.36, -8, 1, -102), Position = UDim2.fromOffset(0, 102) })
	-- which kind of job to show
	local group = "all"
	local groupTabs = { { id = "all", text = S.t("staff_group_all") } }
	for _, g in Employees.groups do
		table.insert(groupTabs, { id = g.id, text = g.icon .. " " .. S.pick(g.name) })
	end
	local fill
	local groupBar = Kit.tabs(c, groupTabs, function(id)
		group = id
		if fill then
			fill()
		end
	end, { Size = UDim2.new(0.64, -8, 0, 28), Position = UDim2.new(0.36, 8, 0, 70) })
	for _, b in groupBar.buttons do
		b.TextSize = 13
	end
	local cands = Kit.list(c, { Size = UDim2.new(0.64, -8, 1, -102), Position = UDim2.new(0.36, 8, 0, 102) }, 8)

	function fill()
		local p = agency and agency.payload or payload
		local ch = Employees.channelById[p.channel or "agency"] or Employees.channels[1]
		selecting = true
		channelTabs.select(ch.id)
		selecting = false
		info.Text = capacityText()
		local lock = lockText(ch)
		local fee = if ch.fee > 0 then S.t("staff_fee", { fee = S.t("staff_fee_days", { n = ch.fee }) }) else S.t("staff_fee", { fee = S.t("staff_free") })
		chInfo.Text = (if lock ~= "" then lock .. "  •  " else "") .. fee .. "  •  " .. S.pick(ch.desc)
		chInfo.TextColor3 = if lock ~= "" then Theme.bad else Theme.dim
		refresh.Text = S.t("staff_refresh", { price = if ch.refresh > 0 then S.money(ch.refresh) else S.t("staff_free") })
		teamList(team)
		Kit.clear(cands)
		local d = State.data
		local hiredFrom = {}
		for _, e in d and d.staff or {} do
			if e.from then
				hiredFrom[e.from] = true
			end
		end
		local shown = 0
		for i, cand in p.candidates or {} do
			local role = Employees.roles[cand.role]
			if not hiredFrom[cand.uid] and (group == "all" or (role and role.group == group)) then
				shown += 1
				candidateCard(cands, cand, i)
			end
		end
		if shown == 0 then
			Kit.label(cands, S.t("staff_none_here"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
		end
	end
	agency = { win = win, payload = payload, fill = fill }
	groupBar.select("all")
	conn = State.changed:Connect(fill)
end

-- Your team only (from the phone).
function StaffPanel.team()
	local conn
	local win = Kit.window(App.screen :: ScreenGui, "🧑‍🔧 " .. S.t("phone_staff"), Vector2.new(820, 540), function()
		if conn then
			conn:Disconnect()
		end
	end)
	local info = Kit.label(win.content, capacityText(), { Size = UDim2.new(1, 0, 0, 24), FontFace = Theme.bold })
	local list = Kit.list(win.content, { Size = UDim2.new(1, 0, 1, -30), Position = UDim2.fromOffset(0, 28) })
	local function fill()
		info.Text = capacityText()
		teamList(list)
	end
	fill()
	conn = State.changed:Connect(fill)
end

function StaffPanel.init()
	Net.on("staff.open", StaffPanel.agency)
end

return StaffPanel
