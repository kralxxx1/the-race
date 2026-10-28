-- Theme: colours, fonts and sizes shared by every window.

local Theme = {}

Theme.bg = Color3.fromRGB(16, 18, 24)
Theme.panel = Color3.fromRGB(26, 29, 38)
Theme.card = Color3.fromRGB(36, 40, 52)
Theme.cardHover = Color3.fromRGB(46, 52, 68)
Theme.line = Color3.fromRGB(64, 70, 88)
Theme.accent = Color3.fromRGB(0, 172, 224)
Theme.accent2 = Color3.fromRGB(255, 168, 40)
Theme.good = Color3.fromRGB(64, 200, 112)
Theme.bad = Color3.fromRGB(232, 72, 72)
Theme.warn = Color3.fromRGB(250, 196, 60)
Theme.text = Color3.fromRGB(236, 239, 246)
Theme.dim = Color3.fromRGB(150, 157, 174)
Theme.money = Color3.fromRGB(120, 230, 140)

Theme.font = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.Medium)
Theme.bold = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.Bold)
Theme.heavy = Font.new("rbxasset://fonts/families/BuilderSans.json", Enum.FontWeight.ExtraBold)
Theme.mono = Font.new("rbxasset://fonts/families/RobotoMono.json", Enum.FontWeight.Medium)

Theme.radius = UDim.new(0, 12)
Theme.radiusSmall = UDim.new(0, 8)
Theme.pad = 10

-- rarity-like colours for part categories
Theme.cat = {
	gpu = Color3.fromRGB(118, 185, 0),
	cpu = Color3.fromRGB(80, 160, 255),
	mobo = Color3.fromRGB(190, 120, 255),
	ram = Color3.fromRGB(255, 120, 200),
	storage = Color3.fromRGB(255, 190, 60),
	psu = Color3.fromRGB(255, 110, 80),
	cooler = Color3.fromRGB(90, 220, 230),
	fan = Color3.fromRGB(140, 200, 255),
	case = Color3.fromRGB(200, 200, 210),
	misc = Color3.fromRGB(170, 170, 180),
	laptop = Color3.fromRGB(255, 150, 90),
}

Theme.catIcon = {
	gpu = "🎮", cpu = "🧠", mobo = "🟩", ram = "📏", storage = "💽", psu = "🔌", cooler = "❄️", fan = "🌀", case = "🖥️", misc = "🧴", laptop = "💻",
}

return Theme
