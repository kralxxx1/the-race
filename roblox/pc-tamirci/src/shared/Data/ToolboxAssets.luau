-- ToolboxAssets: ready-made models from the Roblox Creator Store (the Toolbox) that replace our own
-- where one has been found to look right. Every slot lists candidate asset ids, best first; each one
-- that loads, passes the checks (no scripts kept, a sensible size and part count) and fits is used, up
-- to `keep` of them (the umbrellas come in several looks). When none does, the game keeps its own
-- model: nothing breaks.
--
-- How they get into the game (see ToolboxService / ToolboxLoader):
--   * at server start the loader asks InsertService for each slot (free, public models load in a
--     live game) and publishes the cleaned, fitted copies to ReplicatedStorage.Assets.Toolbox;
--   * or, once, in Studio: paste tools/studio/ImportToolbox.lua into the command bar. It does the
--     same and leaves the copies in the place file, so the published game does not depend on
--     InsertService at all (a model that is in the place file is used as it is).
-- The ids were picked from the Toolbox search (free, no scripts, a few hundred to a few thousand
-- triangles) by looking at their thumbnails; the thumbnails also show which way each one was made
-- (a screwdriver lying along X with the tip on the left, an umbrella standing up...), which is what
-- `tip` / `up` say, so that a model made of one single mesh is turned the right way up as well.
--
--   kind = "tool"    a slender hand tool: the working end goes to the origin, the long axis becomes
--                    +Y, and it is scaled to `length` studs. `tip` = where the working end is in the
--                    model as it was made ("+X", "-X", "+Y", "-Y", "+Z", "-Z"); without it the
--                    thin end of a model with several parts is taken
--   kind = "upright" something that stands up (an umbrella): the wide end up, its foot at the origin,
--                    scaled to `height` studs; `grip` is how far up (0..1) the hand holds it. `up` =
--                    where the top is in the model as it was made (default "+Y")

local ToolboxAssets = {}

ToolboxAssets.slots = {
	screwdriver = {
		kind = "tool",
		length = 2.0,
		keep = 3,
		name = "Screwdriver",
		ids = {
			{ id = 5669169598, tip = "+X" }, -- (red ribbed handle, long thin shaft, flat tip)
			{ id = 14915515793, tip = "+X" }, -- (black and orange handle)
			{ id = 5646922703, tip = "-X" }, -- (red handle with black bands)
			{ id = 13902066103, tip = "-X" }, -- (brown handle)
			{ id = 5315094502 }, -- (red Phillips with a rounded handle, made at a slant)
		},
	},
	umbrella = {
		kind = "upright",
		height = 3.6,
		grip = 0.17,
		keep = 4,
		name = "Umbrella",
		ids = {
			{ id = 6998909237, up = "+Y" }, -- (black, hooked wooden handle)
			{ id = 3602396880, up = "+Y" }, -- (black, scalloped edge)
			{ id = 11509270442, up = "+Y" }, -- (orange compact)
		},
	},
}

ToolboxAssets.order = { "screwdriver", "umbrella" }

-- The id of a candidate entry (a plain number or a table with `id`).
function ToolboxAssets.idOf(entry): number
	if type(entry) == "table" then
		return entry.id
	end
	return entry
end

return ToolboxAssets
