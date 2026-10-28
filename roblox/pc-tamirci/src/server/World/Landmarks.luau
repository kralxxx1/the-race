-- Landmarks: builds every named place from the layout (commerce, civic and nature groups).

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local CityLayout = require(Shared.World.CityLayout)

local Commerce = require(script.Parent.LandmarksCommerce)
local Civic = require(script.Parent.LandmarksCivic)
local Nature = require(script.Parent.LandmarksNature)

local Landmarks = {}

function Landmarks.build(parent: Instance, yieldFn: (() -> ())?)
	local L = CityLayout.get()
	Commerce.build(parent, L, yieldFn)
	Civic.build(parent, L, yieldFn)
	Nature.build(parent, L, yieldFn)
	Landmarks.errors = { Commerce.lastError, Civic.lastError, Nature.lastError }
end

return Landmarks
