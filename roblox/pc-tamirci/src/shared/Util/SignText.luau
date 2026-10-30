-- SignText: Turkish for the words built into the world (shop signs, boards, street signs,
-- interaction prompts), which are written in English. Names, brands, models and street names are
-- not in the table (Data/WorldTextTR) and stay as they are.

local Dict = require(script.Parent.Parent.Data.WorldTextTR)

local SignText = {}

local function translateLine(line: string): string?
	local t = Dict.lines[line]
	if t then
		return t
	end
	for _, p in Dict.patterns do
		local out, n = string.gsub(line, p[1], p[2])
		if n > 0 then
			return out
		end
	end
	return nil
end

-- Turkish text for an English sign/prompt text, or nil when there is nothing to change. A sign is
-- translated line by line; the words between rich-text tags are translated on their own.
function SignText.turkish(text: string): string?
	if type(text) ~= "string" or text == "" then
		return nil
	end
	local whole = Dict.lines[text]
	if whole then
		return whole
	end
	local changed = false
	local lines = string.split(text, "\n")
	for i, l in lines do
		local out
		if string.find(l, "<", 1, true) then
			out = string.gsub(l, ">([^<>]+)<", function(inner)
				local t = translateLine(inner)
				return if t then ">" .. t .. "<" else nil
			end)
		else
			out = translateLine(l)
		end
		if out and out ~= l then
			lines[i] = out
			changed = true
		end
	end
	if not changed then
		return nil
	end
	return table.concat(lines, "\n")
end

return SignText
