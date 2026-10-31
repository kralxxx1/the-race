-- Lots: the empty plots of the city say "for rent" for people who have no shop yet. Once you have
-- opened yours there is only ever one: the prompts on the other plots go quiet for you (the server
-- refuses the rent anyway). The factory is the one other site you will ever have.

local CollectionService = game:GetService("CollectionService")

local State = require(script.Parent.Parent.State)

local Lots = {}

local function runShop(): boolean
	return State.data ~= nil and State.data.opened == true
end

local function apply(prompt: Instance)
	if prompt:IsA("ProximityPrompt") then
		prompt.Enabled = not runShop()
	end
end

function Lots.init()
	for _, p in CollectionService:GetTagged("ClaimPrompt") do
		apply(p)
	end
	CollectionService:GetInstanceAddedSignal("ClaimPrompt"):Connect(apply)
	local last = runShop()
	State.changed:Connect(function()
		local now = runShop()
		if now ~= last then
			last = now
			for _, p in CollectionService:GetTagged("ClaimPrompt") do
				apply(p)
			end
		end
	end)
end

return Lots
