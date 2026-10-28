-- StaffPanel: the staff agency (candidates to hire) and your team (wages, dismissing).

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

local function traitText(id: string?): string
	local t = id and Employees.traitById[id]
	return if t then S.pick(t.name) else ""
end

local function personSub(e): string
	return string.format("%s  •  %s  •  %s", S.stars(e.skill or 1), traitText(e.trait), S.t("staff_wage", { wage = S.money(e.wage or 0) }))
end

local function teamList(list: ScrollingFrame)
	Kit.clear(list)
	local staff = State.data and State.data.staff or {}
	for i, e in staff do
		local role = Employees.roles[e.role]
		local _, right = Kit.row(list, role and role.icon or "🧑", e.name .. "  —  " .. (role and S.pick(role.name) or e.role), personSub(e), { LayoutOrder = i })
		Kit.button(right, S.t("staff_fire"), function()
			local r = Net.request("staff.fire", { uid = e.uid })
			App.report(r, S.t("staff_fired", { name = e.name }))
		end, { Size = UDim2.fromOffset(100, 36) }, "bad")
	end
	if #staff == 0 then
		Kit.label(list, S.t("staff_none"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
	end
end

local function capacityText(): string
	local d = State.data
	if not d then
		return ""
	end
	local lvl = Upgrades.level(d.shop.level)
	return S.t("staff_capacity", { n = #d.staff, m = lvl.staff })
end

-- The agency: candidates on the right, your team on the left.
function StaffPanel.agency(payload)
	local conn
	local win = Kit.window(App.screen :: ScreenGui, "🧑‍💼 " .. S.t("staff"), Vector2.new(980, 600), function()
		if conn then
			conn:Disconnect()
		end
	end)
	local c = win.content
	local info = Kit.label(c, capacityText(), { Size = UDim2.new(0.5, 0, 0, 24), FontFace = Theme.bold })
	Kit.button(c, "🔄 " .. S.t("staff_refresh"), function()
		App.report(Net.request("staff.refresh"))
	end, { Size = UDim2.fromOffset(220, 32), Position = UDim2.new(1, -220, 0, -4) }, "ghost")

	Kit.label(c, S.t("staff_yours"), { Size = UDim2.new(0.4, 0, 0, 22), Position = UDim2.fromOffset(0, 34), TextColor3 = Theme.dim })
	local team = Kit.list(c, { Size = UDim2.new(0.4, -8, 1, -62), Position = UDim2.fromOffset(0, 60) })
	Kit.label(c, S.t("staff_candidates"), { Size = UDim2.new(0.6, 0, 0, 22), Position = UDim2.new(0.4, 8, 0, 34), TextColor3 = Theme.dim })
	local cands = Kit.list(c, { Size = UDim2.new(0.6, -8, 1, -62), Position = UDim2.new(0.4, 8, 0, 60) }, 8)

	local function fillCandidates()
		Kit.clear(cands)
		local d = State.data
		local hiredFrom = {}
		for _, e in d and d.staff or {} do
			if e.from then
				hiredFrom[e.from] = true
			end
		end
		for i, cand in payload.candidates or {} do
			if not hiredFrom[cand.uid] then
				local role = Employees.roles[cand.role]
				local f = Kit.panel(cands, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = Theme.card, LayoutOrder = i })
				Kit.padding(f, 10)
				local inner = Kit.frame(f, { BackgroundTransparency = 1, Size = UDim2.new(1, -160, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
				Kit.listLayout(inner, 2)
				Kit.label(inner, (role and role.icon or "🧑") .. " <b>" .. cand.name .. "</b>  —  " .. (role and S.pick(role.name) or cand.role), { LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 22) })
				Kit.label(inner, personSub(cand), { LayoutOrder = 2, TextColor3 = Theme.warn, TextSize = 14 })
				if role then
					Kit.label(inner, S.pick(role.desc), { LayoutOrder = 3, TextColor3 = Theme.dim, TextSize = 13, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
				end
				local shopOk = not role or not d or d.shop.level >= (role.minShop or 1)
				local b = Kit.button(f, if shopOk then S.t("staff_hire", { price = S.money(cand.hireCost) }) else S.t("staff_needs_shop", { n = role.minShop }), function()
					local r = Net.request("staff.hire", { uid = cand.uid })
					App.report(r, S.t("staff_hired", { name = cand.name }))
				end, { Size = UDim2.fromOffset(150, 38), Position = UDim2.new(1, -150, 0, 4), TextSize = if shopOk then 15 else 13 }, "good")
				Kit.setEnabled(b, shopOk and (d ~= nil and d.money >= cand.hireCost))
			end
		end
	end
	local function fill()
		info.Text = capacityText()
		teamList(team)
		fillCandidates()
	end
	fill()
	conn = State.changed:Connect(fill)
end

-- Your team only (from the phone).
function StaffPanel.team()
	local conn
	local win = Kit.window(App.screen :: ScreenGui, "🧑‍🔧 " .. S.t("phone_staff"), Vector2.new(640, 520), function()
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
