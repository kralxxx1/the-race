-- ShopPanel: your shop. Expand to the next level, buy furniture and equipment, change the look
-- (walls, floor, accent colour) and the name on the sign. Opened from the phone or the estate agent.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Upgrades = require(Shared.Data.Upgrades)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local ShopPanel = {}

local function rgb(t): Color3
	return Color3.fromRGB(t[1], t[2], t[3])
end

local function levelLine(l): string
	return S.t("shop_benches", { n = l.benches, q = l.queue, s = l.seats, st = l.staff }) .. " • 📦 " .. l.storage
end

local function upgradePage(page: Frame)
	local list = Kit.list(page)
	local function fill()
		Kit.clear(list)
		local d = State.data
		if not d then
			return
		end
		local cur = d.shop.level
		for i, l in Upgrades.levels do
			local f, right = Kit.row(list, if i < cur then "✅" elseif i == cur then "🏪" else "🔒", S.pick(l.name) .. " (" .. S.t("level") .. " " .. i .. ")", levelLine(l), { LayoutOrder = i })
			if i == cur then
				Kit.outline(f, Theme.accent, 2, 0)
				Kit.pill(right, S.t("owned"), Theme.accent)
			elseif i == cur + 1 then
				local locked = d.level < l.req
				local b = Kit.button(right, if locked then S.t("needs_level", { n = l.req }) else S.money(l.cost), function()
					local r = Net.request("shop.upgrade")
					if r.ok then
						Hud.banner("🏗️ " .. S.pick(l.name))
					else
						App.report(r)
					end
				end, { Size = UDim2.fromOffset(150, 36), TextSize = if locked then 13 else 16 }, "good")
				Kit.setEnabled(b, not locked and d.money >= l.cost)
			elseif i > cur then
				Kit.label(right, S.money(l.cost), { Size = UDim2.fromOffset(110, 36), TextColor3 = Theme.dim, TextXAlignment = Enum.TextXAlignment.Right })
			end
		end
	end
	fill()
	return fill
end

-- What an item does, in short: "😊 +4  👥 +5%  ⚡ +4%..."
local function perksOf(it): string
	local perks = {}
	local function add(v, text: string)
		if v and v ~= 0 then
			table.insert(perks, text)
		end
	end
	local function pct(v): string
		return (if v > 0 then "+" else "") .. math.floor(v * 100 + 0.5) .. "%"
	end
	add(it.comfort, "😊 +" .. tostring(it.comfort))
	add(it.attract, "👥 +" .. tostring(it.attract) .. "%")
	add(it.patience, "⏳ " .. pct(it.patience or 0))
	add(it.tips, "💵 " .. pct(it.tips or 0))
	add(it.security, "🛡️ +" .. tostring(it.security))
	add(it.speed, "⚡ " .. pct(it.speed or 0))
	add(it.quality, "🎯 " .. pct(it.quality or 0))
	add(it.storage, "📦 +" .. tostring(it.storage))
	add(it.staffMorale, "🧑‍🔧😊 +" .. tostring(it.staffMorale))
	add(it.staffSpeed, "🧑‍🔧⚡ " .. pct(it.staffSpeed or 0))
	add(it.staffLearn, "🎓 " .. pct(it.staffLearn or 0))
	add(it.rep, "⭐ +" .. tostring(it.rep) .. "/" .. S.t("day_short"))
	add(it.xp, "✨ XP " .. pct(it.xp or 0))
	add(it.elecSave, "🔌 -" .. math.floor((it.elecSave or 0) * 100 + 0.5) .. "%")
	add(it.taxRelief, "🏛️ -" .. math.floor((it.taxRelief or 0) * 100 + 0.5) .. "%")
	if it.water and it.water < 0 then
		table.insert(perks, "💧 " .. S.money(it.water) .. "/" .. S.t("day_short"))
	end
	if it.elec and it.elec > 0 then
		table.insert(perks, "⚡ " .. S.money(it.elec) .. "/" .. S.t("day_short"))
	end
	return table.concat(perks, "  ")
end

local function itemsPage(page: Frame)
	local area = Kit.frame(page, { BackgroundTransparency = 1, Size = UDim2.new(1, -248, 1, 0), Position = UDim2.fromOffset(248, 0) })
	local list = Kit.list(area)
	local selected = Upgrades.categories[1].id
	local function fill()
		Kit.clear(list)
		local d = State.data
		if not d then
			return
		end
		local n = 0
		for _, it in Upgrades.items do
			if it.cat == selected then
				n += 1
				local sub = perksOf(it)
				if it.required then
					sub = S.t("shop_required", { n = it.required }) .. "  " .. sub
				end
				if it.desc then
					sub ..= "  " .. S.pick(it.desc)
				end
				local f, right = Kit.row(list, it.icon or "🛒", S.pick(it.name), sub, { LayoutOrder = n })
				local subLabel = f:FindFirstChild("Sub") :: TextLabel?
				if subLabel then
					-- (long descriptions wrap onto a second line)
					f.Size = UDim2.new(1, 0, 0, 72)
					subLabel.Size = UDim2.new(subLabel.Size.X.Scale, subLabel.Size.X.Offset, 0, 36)
					subLabel.TextWrapped = true
					subLabel.TextTruncate = Enum.TextTruncate.AtEnd
					subLabel.TextYAlignment = Enum.TextYAlignment.Top
					subLabel.TextSize = 13
				end
				if d.shop.items[it.id] then
					Kit.pill(right, "✔ " .. S.t("owned"), Theme.good)
				else
					local locked = d.level < (it.level or 1)
					local b = Kit.button(right, if locked then S.t("needs_level", { n = it.level }) else S.money(it.cost), function()
						local r = Net.request("shop.buyItem", { id = it.id })
						App.report(r, S.t("bought", { name = S.pick(it.name) }))
					end, { Size = UDim2.fromOffset(140, 36), TextSize = if locked then 13 else 16 }, "primary")
					Kit.setEnabled(b, not locked and d.money >= it.cost)
				end
			end
		end
	end
	local tabs = {}
	local d = State.data
	for _, c in Upgrades.categories do
		local owned, total = 0, 0
		for _, it in Upgrades.items do
			if it.cat == c.id then
				total += 1
				if d and d.shop.items[it.id] then
					owned += 1
				end
			end
		end
		table.insert(tabs, { id = c.id, text = (c.icon or "") .. " " .. S.pick(c.name) .. "  " .. owned .. "/" .. total })
	end
	local side = Kit.sidebar(page, tabs, function(id)
		selected = id
		fill()
	end, { Size = UDim2.new(0, 240, 1, 0) })
	for _, b in side.buttons do
		b.TextSize = 14
	end
	side.select(selected)
	return fill
end

local function looksPage(page: Frame)
	local list = Kit.list(page, nil, 10)
	local function swatches(title: string, order: number, entries, isCurrent: (any) -> boolean, onPick: (any, number) -> ())
		Kit.label(list, title, { FontFace = Theme.bold, LayoutOrder = order, Size = UDim2.new(1, 0, 0, 22) })
		local row = Kit.frame(list, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = order + 1 })
		local grid = Instance.new("UIGridLayout")
		grid.CellSize = UDim2.fromOffset(120, 64)
		grid.CellPadding = UDim2.fromOffset(8, 8)
		grid.SortOrder = Enum.SortOrder.LayoutOrder
		grid.Parent = row
		for i, e in entries do
			local color = if e.color then rgb(e.color) else rgb(e)
			local b = Kit.button(row, if e.name then S.pick(e.name) else "", function()
				onPick(e, i)
			end, { LayoutOrder = i, TextSize = 13, TextYAlignment = Enum.TextYAlignment.Bottom, TextStrokeTransparency = 0.4 })
			Kit.setColor(b, color)
			if isCurrent(e) or isCurrent(i) then
				Kit.outline(b, Theme.accent, 3, 0)
			end
		end
	end
	local function fill()
		Kit.clear(list)
		local shop = State.data and State.data.shop
		if not shop then
			return
		end
		swatches("🧱 " .. S.t("wall"), 1, Upgrades.wallStyles, function(e)
			return type(e) == "table" and e.id == shop.wall
		end, function(e)
			App.report(Net.request("shop.style", { wall = e.id }))
		end)
		swatches("🟫 " .. S.t("floor"), 3, Upgrades.floorStyles, function(e)
			return type(e) == "table" and e.id == shop.floor
		end, function(e)
			App.report(Net.request("shop.style", { floor = e.id }))
		end)
		swatches("🎨 " .. S.t("accent"), 5, Upgrades.accentColors, function(e)
			return e == shop.accent
		end, function(_, i)
			App.report(Net.request("shop.style", { accent = i }))
		end)
		swatches("🛎️ " .. S.t("look_counter"), 7, Upgrades.counterStyles, function(e)
			return type(e) == "table" and e.id == (shop.counter or "classic")
		end, function(e)
			App.report(Net.request("shop.style", { counter = e.id }))
		end)
		swatches("🛠️ " .. S.t("look_bench"), 9, Upgrades.benchStyles, function(e)
			return type(e) == "table" and e.id == (shop.bench or "steel")
		end, function(e)
			App.report(Net.request("shop.style", { bench = e.id }))
		end)
		local accent = Upgrades.accentColors[shop.accent or 1] or Upgrades.accentColors[1]
		local awnings = {}
		for _, a in Upgrades.awningStyles do
			table.insert(awnings, { id = a.id, name = a.name, color = a.a or accent })
		end
		swatches("⛱️ " .. S.t("look_awning"), 11, awnings, function(e)
			return type(e) == "table" and e.id == (shop.awning or "stripes")
		end, function(e)
			App.report(Net.request("shop.style", { awning = e.id }))
		end)
	end
	fill()
	return fill
end

local function namePage(page: Frame)
	Kit.listLayout(page, 10)
	Kit.label(page, S.t("shop_rename"), { FontFace = Theme.bold, LayoutOrder = 1 })
	local box = Kit.input(page, "PC Usta", { LayoutOrder = 2, Size = UDim2.new(0, 420, 0, 38) })
	box.Text = State.data and State.data.shop.name or ""
	Kit.button(page, S.t("confirm"), function()
		local name = string.sub(box.Text, 1, 28)
		if #name == 0 then
			return
		end
		App.report(Net.request("shop.rename", name), "✔ " .. name)
	end, { LayoutOrder = 3 }, "primary")
	return function() end
end

-- opts: { freePlots = n?, onClose = fn? }
function ShopPanel.open(opts: { [string]: any }?)
	local o = opts or {}
	local conn
	local win = Kit.window(App.screen :: ScreenGui, "🏪 " .. S.t("shop"), Vector2.new(900, 600), function()
		if conn then
			conn:Disconnect()
		end
		if o.onClose then
			o.onClose()
		end
	end)
	local c = win.content
	local d = State.data
	local lvl = d and Upgrades.level(d.shop.level)
	local head = (if lvl then S.t("shop_level", { name = S.pick(lvl.name), n = d.shop.level }) else "")
	if o.freePlots then
		head ..= "   •   🔑 " .. S.t("free_plots", { n = o.freePlots })
	end
	Kit.label(c, head, { Size = UDim2.new(1, 0, 0, 24), TextColor3 = Theme.dim, TextSize = 14 })
	local bottom = if o.freePlots then 22 else 0
	local area = Kit.frame(c, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, -74 - bottom), Position = UDim2.fromOffset(0, 72) })
	local pages, fills = {}, {}
	local builders = { upgrade = upgradePage, items = itemsPage, looks = looksPage, name = namePage }
	local current = "upgrade"
	local tabs = Kit.tabs(c, {
		{ id = "upgrade", text = "🏗️ " .. S.t("shop_expand_tab") },
		{ id = "items", text = "🛋️ " .. S.t("shop_items") },
		{ id = "looks", text = "🎨 " .. S.t("shop_looks") },
		{ id = "name", text = "✏️ " .. S.t("shop_rename") },
	}, function(id)
		current = id
		for k, f in pages do
			f.Visible = k == id
		end
		if not pages[id] then
			local f = Kit.frame(area, { BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1) })
			pages[id] = f
			fills[id] = builders[id](f)
		end
	end, { Position = UDim2.fromOffset(0, 30) })
	tabs.select("upgrade")
	if o.freePlots then
		Kit.label(c, S.t("store_realty_hint"), { Size = UDim2.new(1, 0, 0, 20), Position = UDim2.new(0, 0, 1, -18), TextColor3 = Theme.dim, TextSize = 13 })
	end
	conn = State.changed:Connect(function()
		if current ~= "name" and fills[current] then
			fills[current]()
		end
	end)
end

return ShopPanel
