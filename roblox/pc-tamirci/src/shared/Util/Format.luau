-- Format: money, numbers, durations and clock strings for both languages.

local Config = require(script.Parent.Parent.Config)

local Format = {}

local function groupDigits(n: number, sep: string): string
	local s = tostring(math.floor(math.abs(n) + 0.5))
	local out = s:reverse():gsub("(%d%d%d)", "%1" .. sep):reverse()
	if string.sub(out, 1, #sep) == sep then
		out = string.sub(out, #sep + 1)
	end
	return out
end

-- "$12,345" (en) / "$12.345" (tr)
function Format.money(n: number, lang: string?): string
	local sep = if lang == "en" then "," else "."
	local sign = if n < 0 then "-" else ""
	return sign .. Config.CurrencySymbol .. groupDigits(n, sep)
end

function Format.number(n: number, lang: string?): string
	local sep = if lang == "en" then "," else "."
	local sign = if n < 0 then "-" else ""
	return sign .. groupDigits(n, sep)
end

-- 1.2K, 3.4M, 5.6B
function Format.compact(n: number): string
	local a = math.abs(n)
	local sign = if n < 0 then "-" else ""
	if a >= 1e9 then
		return sign .. string.format("%.1fB", a / 1e9)
	elseif a >= 1e6 then
		return sign .. string.format("%.1fM", a / 1e6)
	elseif a >= 1e4 then
		return sign .. string.format("%.1fK", a / 1e3)
	end
	return sign .. tostring(math.floor(a + 0.5))
end

-- 125 -> "2:05"
function Format.duration(seconds: number): string
	seconds = math.max(0, math.floor(seconds + 0.5))
	local m = seconds // 60
	local s = seconds % 60
	if m >= 60 then
		return string.format("%d:%02d:%02d", m // 60, m % 60, s)
	end
	return string.format("%d:%02d", m, s)
end

-- 14.5 -> "14:30"
function Format.clock(clockTime: number): string
	local h = math.floor(clockTime) % 24
	local m = math.floor((clockTime % 1) * 60)
	return string.format("%02d:%02d", h, m)
end

function Format.percent(x: number): string
	return string.format("%d%%", math.floor(x * 100 + 0.5))
end

-- Storage sizes: 512 -> "512 GB", 2048 -> "2 TB"
function Format.storage(gb: number): string
	if gb >= 1000 then
		local tb = gb / 1000
		if tb == math.floor(tb) then
			return string.format("%d TB", tb)
		end
		return string.format("%.1f TB", tb)
	end
	return string.format("%d GB", gb)
end

-- "★★★★☆"
function Format.stars(rating: number): string
	local full = math.clamp(math.floor(rating + 0.5), 0, 5)
	return string.rep("★", full) .. string.rep("☆", 5 - full)
end

return Format
