-- Kit: small UI building blocks with the game's look (rounded dark panels, accent buttons,
-- scrolling lists, tabs, windows). Everything is created from code.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Theme = require(script.Parent.Theme)

local Kit = {}
Kit.clickSound = nil :: (() -> ())? -- set by the client entry point

local player = Players.LocalPlayer

function Kit.tween(obj: Instance, props: { [string]: any }, time: number?, style: Enum.EasingStyle?)
	local t = TweenService:Create(obj, TweenInfo.new(time or 0.18, style or Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props)
	t:Play()
	return t
end

local function apply(inst: Instance, props: { [string]: any }?)
	if props then
		for k, v in props do
			(inst :: any)[k] = v
		end
	end
	return inst
end

function Kit.corner(parent: Instance, r: UDim?)
	local c = Instance.new("UICorner")
	c.CornerRadius = r or Theme.radius
	c.Parent = parent
	return c
end

function Kit.stroke(parent: Instance, color: Color3?, thickness: number?, transparency: number?)
	local s = Instance.new("UIStroke")
	s.Color = color or Theme.line
	s.Thickness = thickness or 1
	s.Transparency = transparency or 0.3
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = parent
	return s
end

-- Sets the (single) outline of a GUI object, creating it when missing.
function Kit.outline(obj: Instance, color: Color3, thickness: number?, transparency: number?)
	local s = obj:FindFirstChildOfClass("UIStroke")
	if not s then
		return Kit.stroke(obj, color, thickness, transparency)
	end
	s.Color = color
	s.Thickness = thickness or 1
	s.Transparency = transparency or 0.3
	return s
end

function Kit.padding(parent: Instance, px: number?)
	local p = Instance.new("UIPadding")
	local v = UDim.new(0, px or Theme.pad)
	p.PaddingLeft, p.PaddingRight, p.PaddingTop, p.PaddingBottom = v, v, v, v
	p.Parent = parent
	return p
end

function Kit.listLayout(parent: Instance, padding: number?, horizontal: boolean?, align: Enum.HorizontalAlignment?)
	local l = Instance.new("UIListLayout")
	l.Padding = UDim.new(0, padding or 6)
	l.SortOrder = Enum.SortOrder.LayoutOrder
	l.FillDirection = if horizontal then Enum.FillDirection.Horizontal else Enum.FillDirection.Vertical
	if align then
		l.HorizontalAlignment = align
	end
	if horizontal then
		l.VerticalAlignment = Enum.VerticalAlignment.Center
	end
	l.Parent = parent
	return l
end

function Kit.screen(name: string, order: number?): ScreenGui
	local g = Instance.new("ScreenGui")
	g.Name = name
	g.ResetOnSpawn = false
	g.IgnoreGuiInset = true
	g.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	g.DisplayOrder = order or 0
	g.Parent = player:WaitForChild("PlayerGui")
	-- shrink the UI on small screens
	local scale = Instance.new("UIScale")
	scale.Parent = g
	local function fit()
		local cam = Workspace.CurrentCamera
		local vp = if cam then cam.ViewportSize else Vector2.new(1280, 720)
		local user = g:GetAttribute("UserScale")
		scale.Scale = math.clamp(math.min(vp.X / 1280, vp.Y / 720), 0.55, 1.15) * (if type(user) == "number" then user else 1)
	end
	fit()
	g:GetAttributeChangedSignal("UserScale"):Connect(fit) -- the Settings window
	local cam = Workspace.CurrentCamera
	if cam then
		cam:GetPropertyChangedSignal("ViewportSize"):Connect(fit)
	end
	return g
end

function Kit.frame(parent: Instance?, props: { [string]: any }?): Frame
	local f = Instance.new("Frame")
	f.BackgroundColor3 = Theme.panel
	f.BorderSizePixel = 0
	apply(f, props)
	f.Parent = parent
	return f
end

function Kit.panel(parent: Instance?, props: { [string]: any }?): Frame
	local f = Kit.frame(parent, props)
	Kit.corner(f)
	Kit.stroke(f)
	return f
end

-- Rich text needs a lone "&" escaped ("Parts & Tools").
function Kit.esc(text: string): string
	return (string.gsub(text, "&(%s)", "&amp;%1"))
end

function Kit.label(parent: Instance?, text: string, props: { [string]: any }?): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Text = Kit.esc(text)
	l.TextColor3 = Theme.text
	l.FontFace = Theme.font
	l.TextSize = 16
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextWrapped = true
	l.RichText = true
	l.Size = UDim2.new(1, 0, 0, 20)
	apply(l, props)
	l.Parent = parent
	return l
end

-- Button variants: "primary" (accent), "good", "bad", "ghost" (outline), default (card)
function Kit.button(parent: Instance?, text: string, onClick: (() -> ())?, props: { [string]: any }?, variant: string?): TextButton
	local b = Instance.new("TextButton")
	b.AutoButtonColor = false
	b.Text = text
	b.TextColor3 = Theme.text
	b.FontFace = Theme.bold
	b.TextSize = 16
	b.Size = UDim2.new(0, 140, 0, 36)
	b.BorderSizePixel = 0
	local base = Theme.card
	if variant == "primary" then
		base = Theme.accent
	elseif variant == "good" then
		base = Theme.good
	elseif variant == "bad" then
		base = Theme.bad
	elseif variant == "warn" then
		base = Theme.accent2
	end
	b.BackgroundColor3 = base
	if variant == "ghost" then
		b.BackgroundTransparency = 1
		Kit.stroke(b, Theme.line, 1, 0.1)
	end
	Kit.corner(b, Theme.radiusSmall)
	apply(b, props)
	-- hover effects follow the current base colour (tabs and tool bars recolour their buttons)
	b:SetAttribute("BaseColor", b.BackgroundColor3)
	local function baseOf(): Color3
		local c = b:GetAttribute("BaseColor")
		return if typeof(c) == "Color3" then c else base
	end
	b.MouseEnter:Connect(function()
		if b.Active then
			Kit.tween(b, { BackgroundColor3 = baseOf():Lerp(Color3.new(1, 1, 1), 0.12) }, 0.1)
		end
	end)
	b.MouseLeave:Connect(function()
		Kit.tween(b, { BackgroundColor3 = baseOf() }, 0.12)
	end)
	b.MouseButton1Down:Connect(function()
		Kit.tween(b, { BackgroundColor3 = baseOf():Lerp(Color3.new(0, 0, 0), 0.15) }, 0.06)
	end)
	if onClick then
		b.Activated:Connect(function()
			if b.Active then
				if Kit.clickSound then
					Kit.clickSound()
				end
				onClick()
			end
		end)
	end
	b.Parent = parent
	return b
end

-- Recolours a Kit button (keeps its hover effect in step).
function Kit.setColor(b: GuiButton, color: Color3)
	b:SetAttribute("BaseColor", color)
	b.BackgroundColor3 = color
end

function Kit.setEnabled(b: GuiButton, on: boolean)
	b.Active = on
	b.AutoButtonColor = false
	b.BackgroundTransparency = if on then 0 else 0.55
	if b:IsA("TextButton") then
		b.TextTransparency = if on then 0 else 0.45
	end
end

function Kit.pill(parent: Instance?, text: string, color: Color3?, props: { [string]: any }?): TextLabel
	local l = Kit.label(parent, text, { AutomaticSize = Enum.AutomaticSize.X, Size = UDim2.new(0, 0, 0, 20), TextSize = 13, FontFace = Theme.bold, BackgroundTransparency = 0.15, BackgroundColor3 = color or Theme.accent, TextXAlignment = Enum.TextXAlignment.Center })
	Kit.corner(l, UDim.new(1, 0))
	local p = Instance.new("UIPadding")
	p.PaddingLeft, p.PaddingRight = UDim.new(0, 8), UDim.new(0, 8)
	p.Parent = l
	apply(l, props)
	return l
end

-- Vertical scrolling list that grows its canvas with the content.
function Kit.list(parent: Instance?, props: { [string]: any }?, padding: number?): ScrollingFrame
	local s = Instance.new("ScrollingFrame")
	s.BackgroundTransparency = 1
	s.BorderSizePixel = 0
	s.ScrollBarThickness = 6
	s.ScrollBarImageColor3 = Theme.line
	s.CanvasSize = UDim2.new()
	s.AutomaticCanvasSize = Enum.AutomaticSize.Y
	s.ScrollingDirection = Enum.ScrollingDirection.Y
	s.Size = UDim2.fromScale(1, 1)
	apply(s, props)
	Kit.listLayout(s, padding or 6)
	local p = Instance.new("UIPadding")
	p.PaddingRight = UDim.new(0, 8)
	p.PaddingTop = UDim.new(0, 2)
	p.PaddingBottom = UDim.new(0, 2)
	p.Parent = s
	s.Parent = parent
	return s
end

function Kit.grid(parent: Instance?, cell: UDim2, props: { [string]: any }?): ScrollingFrame
	local s = Instance.new("ScrollingFrame")
	s.BackgroundTransparency = 1
	s.BorderSizePixel = 0
	s.ScrollBarThickness = 6
	s.ScrollBarImageColor3 = Theme.line
	s.CanvasSize = UDim2.new()
	s.AutomaticCanvasSize = Enum.AutomaticSize.Y
	s.ScrollingDirection = Enum.ScrollingDirection.Y
	s.Size = UDim2.fromScale(1, 1)
	apply(s, props)
	local g = Instance.new("UIGridLayout")
	g.CellSize = cell
	g.CellPadding = UDim2.fromOffset(8, 8)
	g.SortOrder = Enum.SortOrder.LayoutOrder
	g.Parent = s
	local p = Instance.new("UIPadding")
	p.PaddingRight = UDim.new(0, 8)
	p.PaddingTop = UDim.new(0, 2)
	p.Parent = s
	s.Parent = parent
	return s
end

function Kit.clear(container: Instance)
	for _, c in container:GetChildren() do
		if c:IsA("GuiObject") then
			c:Destroy()
		end
	end
end

function Kit.progress(parent: Instance?, props: { [string]: any }?, color: Color3?)
	local back = Kit.frame(parent, { Size = UDim2.new(1, 0, 0, 8), BackgroundColor3 = Theme.bg })
	Kit.corner(back, UDim.new(1, 0))
	apply(back, props)
	local fill = Kit.frame(back, { Size = UDim2.fromScale(0, 1), BackgroundColor3 = color or Theme.accent })
	Kit.corner(fill, UDim.new(1, 0))
	return {
		frame = back,
		fill = fill,
		set = function(_, f: number, animate: boolean?)
			local size = UDim2.fromScale(math.clamp(f, 0, 1), 1)
			if animate then
				Kit.tween(fill, { Size = size }, 0.25)
			else
				fill.Size = size
			end
		end,
	}
end

function Kit.input(parent: Instance?, placeholder: string, props: { [string]: any }?): TextBox
	local t = Instance.new("TextBox")
	t.BackgroundColor3 = Theme.bg
	t.TextColor3 = Theme.text
	t.PlaceholderText = placeholder
	t.PlaceholderColor3 = Theme.dim
	t.FontFace = Theme.font
	t.TextSize = 16
	t.Text = ""
	t.ClearTextOnFocus = false
	t.Size = UDim2.new(1, 0, 0, 34)
	t.TextXAlignment = Enum.TextXAlignment.Left
	Kit.corner(t, Theme.radiusSmall)
	local p = Instance.new("UIPadding")
	p.PaddingLeft = UDim.new(0, 10)
	p.Parent = t
	apply(t, props)
	t.Parent = parent
	return t
end

-- Tabs: a row of buttons; onSelect(id) when changed. Returns { bar, select(id) }.
function Kit.tabs(parent: Instance, tabs: { { id: string, text: string } }, onSelect: (string) -> (), props: { [string]: any }?)
	local bar = Kit.frame(parent, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 34) })
	apply(bar, props)
	Kit.listLayout(bar, 6, true)
	local buttons = {}
	local api = {}
	function api.select(id: string)
		for tid, b in buttons do
			local on = tid == id
			Kit.setColor(b, if on then Theme.accent else Theme.card)
			b.TextColor3 = if on then Color3.new(1, 1, 1) else Theme.dim
		end
		onSelect(id)
	end
	for i, t in tabs do
		local b = Kit.button(bar, t.text, function()
			api.select(t.id)
		end, { Size = UDim2.new(0, 0, 1, 0), AutomaticSize = Enum.AutomaticSize.X, LayoutOrder = i, TextSize = 15 })
		local pad = Instance.new("UIPadding")
		pad.PaddingLeft, pad.PaddingRight = UDim.new(0, 12), UDim.new(0, 12)
		pad.Parent = b
		buttons[t.id] = b
	end
	api.bar = bar
	api.buttons = buttons
	return api
end

-- Vertical tab list (store categories). Returns { frame, select(id), buttons }.
function Kit.sidebar(parent: Instance, tabs: { { id: string, text: string } }, onSelect: (string) -> (), props: { [string]: any }?)
	local bar = Kit.list(parent, { Size = UDim2.new(0, 190, 1, 0) }, 4)
	apply(bar, props)
	local buttons = {}
	local api = { frame = bar, buttons = buttons }
	function api.select(id: string)
		for tid, b in buttons do
			local on = tid == id
			Kit.setColor(b, if on then Theme.accent else Theme.card)
			b.TextColor3 = if on then Color3.new(1, 1, 1) else Theme.text
		end
		onSelect(id)
	end
	for i, t in tabs do
		local b = Kit.button(bar, t.text, function()
			api.select(t.id)
		end, { Size = UDim2.new(1, 0, 0, 36), LayoutOrder = i, TextSize = 15, TextXAlignment = Enum.TextXAlignment.Left })
		local pad = Instance.new("UIPadding")
		pad.PaddingLeft = UDim.new(0, 10)
		pad.Parent = b
		buttons[t.id] = b
	end
	return api
end

----------------------------------------------------------------------------------------------------
-- Windows: one centred modal window at a time
----------------------------------------------------------------------------------------------------
local current = nil
Kit.windowChanged = Instance.new("BindableEvent")

function Kit.window(gui: ScreenGui, title: string, size: Vector2?, onClose: (() -> ())?)
	if current then
		current.close(true)
	end
	local w = size or Vector2.new(760, 520)
	local root = Kit.panel(gui, {
		Name = "Window",
		Size = UDim2.fromOffset(w.X, w.Y),
		Position = UDim2.fromScale(0.5, 0.5),
		AnchorPoint = Vector2.new(0.5, 0.5),
		BackgroundColor3 = Theme.panel,
		BackgroundTransparency = 0,
	})
	local header = Kit.frame(root, { Name = "Header", Size = UDim2.new(1, 0, 0, 48), BackgroundTransparency = 1 })
	local titleLabel = Kit.label(header, title, { Name = "Title", Size = UDim2.new(1, -70, 1, 0), Position = UDim2.fromOffset(16, 0), FontFace = Theme.heavy, TextSize = 22, TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
	local api = { root = root, header = header }
	local closeBtn = Kit.button(header, "×", function()
		api.close()
	end, { Size = UDim2.fromOffset(36, 36), Position = UDim2.new(1, -44, 0, 6), TextSize = 18 })
	closeBtn.Name = "Close"
	local content = Kit.frame(root, { Name = "Content", BackgroundTransparency = 1, Size = UDim2.new(1, -24, 1, -60), Position = UDim2.fromOffset(12, 50) })
	api.content = content
	local closed = false
	function api.close(silent: boolean?)
		if closed then
			return
		end
		closed = true
		if current == api then
			current = nil
		end
		root:Destroy()
		if onClose then
			onClose()
		end
		if not silent then
			Kit.windowChanged:Fire(nil)
		end
	end
	function api.setTitle(t: string)
		titleLabel.Text = t
	end
	function api.isOpen(): boolean
		return not closed
	end
	current = api
	-- pop-in
	local scale = Instance.new("UIScale")
	scale.Scale = 0.92
	scale.Parent = root
	Kit.tween(scale, { Scale = 1 }, 0.16, Enum.EasingStyle.Back)
	Kit.windowChanged:Fire(api)
	return api
end

function Kit.closeWindow()
	if current then
		current.close()
	end
end

function Kit.currentWindow()
	return current
end

-- A card row: icon, title, subtitle, right side area (rightWidth px, default 220). Returns the
-- frame and its right container.
function Kit.row(parent: Instance, icon: string, title: string, sub: string?, props: { [string]: any }?, rightWidth: number?)
	local rw = rightWidth or 220
	local f = Kit.panel(parent, { Size = UDim2.new(1, 0, 0, 58), BackgroundColor3 = Theme.card })
	Kit.outline(f, Theme.line, 1, 0.6)
	apply(f, props)
	Kit.label(f, icon, { Size = UDim2.fromOffset(40, 40), Position = UDim2.fromOffset(10, 9), TextSize = 26, TextXAlignment = Enum.TextXAlignment.Center })
	Kit.label(f, title, { Name = "Title", Size = UDim2.new(1, -(rw + 20 + 58), 0, 22), Position = UDim2.fromOffset(58, 8), FontFace = Theme.bold, TextSize = 16, TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
	if sub then
		Kit.label(f, sub, { Name = "Sub", Size = UDim2.new(1, -(rw + 20 + 58), 0, 20), Position = UDim2.fromOffset(58, 30), TextColor3 = Theme.dim, TextSize = 14, TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
	end
	local right = Kit.frame(f, { Name = "Right", BackgroundTransparency = 1, Size = UDim2.new(0, rw, 1, -16), Position = UDim2.new(1, -(rw + 8), 0, 8) })
	Kit.listLayout(right, 6, true, Enum.HorizontalAlignment.Right)
	return f, right
end

return Kit
