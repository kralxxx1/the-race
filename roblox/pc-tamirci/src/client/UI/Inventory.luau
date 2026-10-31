-- Inventory (B): parts on your shelves, consumables and the tools you own.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Parts = require(Shared.Data.Parts)
local Tools = require(Shared.Data.Tools)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local ToolIcon = require(UI.ToolIcon)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local Inventory = {}

local win = nil

local function partsPage(list: ScrollingFrame)
	local items = State.data and State.data.inv or {}
	local sorted = table.clone(items)
	local order = {}
	for i, c in Parts.Categories do
		order[c] = i
	end
	table.sort(sorted, function(a, b)
		local pa, pb = Parts.get(a.part), Parts.get(b.part)
		local ca, cb = pa and order[pa.cat] or 99, pb and order[pb.cat] or 99
		if ca ~= cb then
			return ca < cb
		end
		return (pa and pa.price or 0) > (pb and pb.price or 0)
	end)
	for i, item in sorted do
		local p = Parts.get(item.part)
		if p then
			local cond = if item.cond and item.cond < 0.999 then S.t("cond", { n = math.floor(item.cond * 100) }) else S.t("cond_new")
			local _, right = Kit.row(list, Theme.catIcon[p.cat] or "📦", p.name, cond .. " • " .. Parts.spec(p, S.lang()), { LayoutOrder = i })
			if item.broken then
				Kit.pill(right, S.t("broken_known"), Theme.bad)
			end
			local origin = item.origin and S.has("origin_" .. item.origin) and S.t("origin_" .. item.origin)
			if origin then
				Kit.pill(right, origin, Theme.cat[p.cat] or Theme.accent)
			end
		end
	end
	if #sorted == 0 then
		Kit.label(list, S.t("empty"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
	end
end

local function stockPage(list: ScrollingFrame)
	local n = 0
	for id, uses in State.data and State.data.stock or {} do
		local p = Parts.get(id)
		if p and uses > 0 then
			n += 1
			local _, right = Kit.row(list, Theme.catIcon.misc, p.name, S.t("consumable"), { LayoutOrder = n })
			Kit.pill(right, S.t("stock_uses", { n = uses }), Theme.accent)
		end
	end
	if n == 0 then
		Kit.label(list, S.t("empty"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
	end
end

local function toolsPage(list: ScrollingFrame)
	local n = 0
	for _, t in Tools.list do
		if State.owns(t.id) then
			n += 1
			ToolIcon.row(Kit.row(list, t.icon, S.pick(t.name), S.pick(t.desc), { LayoutOrder = t.order or n }), t.id)
		end
	end
end

function Inventory.open(tab: string?)
	local conn
	win = Kit.window(App.screen :: ScreenGui, "🎒 " .. S.t("inventory"), Vector2.new(820, 560), function()
		if conn then
			conn:Disconnect()
		end
	end)
	local c = win.content
	local info = Kit.label(c, "", { Size = UDim2.new(1, 0, 0, 22), TextColor3 = Theme.dim, TextSize = 14 })
	local list = Kit.list(c, { Size = UDim2.new(1, 0, 1, -72), Position = UDim2.fromOffset(0, 70) })
	local current = tab or "parts"
	local function fill()
		local d = State.data
		info.Text = if d then "📦 " .. S.t("storage", { n = #d.inv, m = d.capacity or 0 }) else ""
		Kit.clear(list)
		if current == "parts" then
			partsPage(list)
		elseif current == "stock" then
			stockPage(list)
		else
			toolsPage(list)
		end
	end
	local tabs = Kit.tabs(c, {
		{ id = "parts", text = "📦 " .. S.t("inv_parts") },
		{ id = "stock", text = "🧴 " .. S.t("inv_stock") },
		{ id = "tools", text = "🧰 " .. S.t("inv_tools") },
	}, function(id)
		current = id
		fill()
	end, { Position = UDim2.fromOffset(0, 28) })
	tabs.select(current)
	conn = State.changed:Connect(fill)
end

function Inventory.toggle()
	if win and win.isOpen() then
		win.close()
	else
		Inventory.open()
	end
end

return Inventory
