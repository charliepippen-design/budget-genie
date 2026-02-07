import { ChannelData } from "@/hooks/use-media-plan-store";

/**
 * Normalizes active channels to ensure they sum to exactly 100%.
 * 
 * Rules:
 * 1. Inactive channels are ignored for the sum but their values are preserved.
 * 2. Fixed channels (FLAT_FEE, RETAINER, fixed tier) are ignored generally in strictly % based logic, 
 *    but for the Mixed-Model, we usually assume the 100% applies to the "Variable Pool" 
 *    OR the Total Budget.
 *    
 *    However, based on the prompt's context ("SUM(Active Channels) must always equal 100.00%"),
 *    this usually refers to the percentage allocation of the variable budget.
 *    If the app treats allocationPct as "% of Total Budget", then Fixed Channels 
 *    (which have fixed spend) effectively take up a % slot too.
 *    
 *    Let's stick to the prompt's specific logic for the "Ghost Math":
 *    "SUM(Active Channels) must always equal 100.00%".
 *    
 *    We will normalize the `allocationPct` of all ACTIVE channels to sum to 100.
 *    Inactive channels keep their 'ghost' values.
 */
export function normalizeAllocations(channels: ChannelData[]): ChannelData[] {
    // 1. Separate Active vs Inactive
    // Note: We need to handle the case where 'isActive' might be undefined for legacy data (default to true)
    const isActive = (ch: ChannelData) => ch.isActive !== false;

    const activeChannels = channels.filter(isActive);
    const inactiveChannels = channels.filter(ch => !isActive(ch));

    if (activeChannels.length === 0) {
        return channels;
    }

    // 2. Identify Locked vs Unlocked among ACTIVE channels
    const lockedChannels = activeChannels.filter(ch => ch.locked);
    const unlockedChannels = activeChannels.filter(ch => !ch.locked);

    // 3. Sum Locked Percentage
    const lockedTotal = lockedChannels.reduce((sum, ch) => sum + ch.allocationPct, 0);

    // 4. Determine Remaining Pool for Unlocked
    // If locked total > 100, we have a problem, but we'll clamp to 0.
    // In a strict normalization, we might force locked channels down, 
    // but standard UX is "Locked stays locked unless impossible".
    // If Locked > 100, we scale them down? Or we just accept 100 and unlocked get 0.
    const remainingPool = Math.max(0, 100 - lockedTotal);

    // 5. Calculate Scalar for Unlocked
    const currentUnlockedTotal = unlockedChannels.reduce((sum, ch) => sum + ch.allocationPct, 0);

    // Guard: If current unlocked total is 0, we can't scale 0 to match the pool.
    // Unless the pool is also 0.
    // If pool > 0 and total is 0, we might need to seed them? 
    // Or just leave them at 0 and have < 100% total (user error).
    // But strict normalization requests 100%.
    // We'll proceed with scalar logic.
    let scalar = 0;
    if (currentUnlockedTotal > 0) {
        scalar = remainingPool / currentUnlockedTotal;
    }

    // 6. Apply Scalar to Unlocked Channels (First Pass)
    const normalizedUnlocked = unlockedChannels.map(ch => ({
        ...ch,
        allocationPct: ch.allocationPct * scalar
    }));

    // 7. Combine Locked + Normalized Unlocked
    let processedActive = [...lockedChannels, ...normalizedUnlocked];

    // 8. Residue Check (Largest Remainder Method for 100.00% precision)
    // Round all to 2 decimal places
    const precision = 100; // 2 decimal places
    let rounded = processedActive.map(ch => ({
        ...ch,
        rawPct: ch.allocationPct,
        allocationPct: Math.floor(ch.allocationPct * precision) / precision
    }));

    const roundedSum = rounded.reduce((sum, ch) => sum + ch.allocationPct, 0);
    let remainder = 100 - roundedSum; // e.g., 0.02

    // Avoid floating point drift in the remainder calculation itself
    remainder = Number(remainder.toFixed(2));

    if (remainder > 0) {
        // Distribute remainder (in 0.01 chunks) to those with largest decimal parts
        // Calculate decimal part from original scaled values
        const withDecimal = rounded.map(ch => ({
            ...ch,
            decimal: ch.rawPct * precision - Math.floor(ch.rawPct * precision)
        }));

        // Sort by decimal part descending
        withDecimal.sort((a, b) => b.decimal - a.decimal);

        // How many 0.01s do we have to give out?
        let steps = Math.round(remainder * precision); // e.g. 0.02 * 100 = 2 chunks

        for (let i = 0; i < steps; i++) {
            // Cycle through sorted list if steps > active count (unlikely but safe)
            const targetId = withDecimal[i % withDecimal.length].id;
            const targetIndex = rounded.findIndex(ch => ch.id === targetId);
            if (targetIndex !== -1) {
                rounded[targetIndex].allocationPct += (1 / precision);
            }
        }
    }

    // Final check to handle floating nonsense (e.g. 100.0000001)
    processedActive = rounded.map(ch => ({
        ...ch,
        allocationPct: Number(ch.allocationPct.toFixed(2))
    }));

    // 9. Reassemble All Channels
    // We map the original array to preserve order
    return channels.map(original => {
        // If inactive, return as is (Ghost Value preserved)
        if (!isActive(original)) return original;

        // If active, return the normalized version
        const normalized = processedActive.find(n => n.id === original.id);
        return normalized || original;
    });
}
