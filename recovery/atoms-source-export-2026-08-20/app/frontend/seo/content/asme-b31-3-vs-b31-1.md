---
title: "ASME B31.3 vs B31.1: Which Code Applies to Your Piping Project?"
description: "ASME B31.3 (Process Piping) and B31.1 (Power Piping) are the two most referenced codes in industrial piping. Learn the key differences, when each applies, and why choosing the wrong code can cost millions."
date: "2025-07-04"
author: "PipingBox"
category: "Engineering"
tags: ["ASME", "B31.3", "B31.1", "piping", "code", "pressure"]
---

# ASME B31.3 vs B31.1: Which Code Applies to Your Piping Project?

When you're standing on a refinery deck at 2 AM, trying to figure out which ASME code governs the pipe you're about to weld, the difference between B31.3 and B31.1 isn't academic — it's the difference between a safe installation and a catastrophic failure.

## The Short Answer

- **ASME B31.1 — Power Piping:** Governs piping in power generation plants, central heating systems, and boiler external piping. Think: steam lines feeding turbines, boiler feedwater, main steam.
- **ASME B31.3 — Process Piping:** Governs piping in chemical plants, petroleum refineries, petrochemical plants, and natural gas processing plants. Think: everything in a refinery that's not power generation.

## Key Differences

| Dimension | B31.1 (Power) | B31.3 (Process) |
|-----------|---------------|-----------------|
| Primary application | Power plants, boilers | Refineries, chemical plants |
| Pressure rating | Generally higher (steam) | Varies (process fluids) |
| Temperature | High (steam ~540°C) | Varies (-196°C to 800°C+) |
| Corrosion allowance | Typically lower | Higher (corrosive process fluids) |
| Flexibility analysis | Required | Required (more stringent) |
| Welding qualification | ASME Sec IX | ASME Sec IX (same) |
| NDT requirements | Less prescriptive | More prescriptive (RT/UT %) |
| Impact testing | Less common (steam) | Common (low-temp services) |

## When It Gets Tricky

The confusion arises in **cogeneration plants** and **refinery utility systems** where both codes might apply:

1. **Steam header feeding a turbine:** B31.1 (power piping)
2. **Steam tracing on a process line:** B31.3 (process piping, even though it's steam)
3. **Boiler feedwater in a refinery:** B31.1 if it's the boiler's external piping, B31.3 if it's process feedwater

**Rule of thumb:** If the pipe is part of the power generation cycle (boiler → turbine → condenser), it's B31.1. If it's part of the process (chemical reaction, separation, treatment), it's B31.3 — even if it carries steam.

## Wall Thickness Calculation

Both codes use similar formulas for straight pipe under internal pressure:

**B31.1:** t = (P × D) / (2(SE + Py))

**B31.3:** t = (P × D) / (2(SEW + Py))

The difference: B31.3 includes the **W** factor (weld joint strength reduction factor), which accounts for the reduced strength of longitudinal welds at elevated temperatures. B31.1 does not use W.

## Practical Advice for Pipefitters and Supervisors

1. **Check the Line Designation List (Line List):** It will specify the code (B31.1 or B31.3) for every line.
2. **When in doubt, ask the engineering team:** Don't guess. The cost of using the wrong code is orders of magnitude higher than the cost of a phone call.
3. **The welding procedure (WPS) may differ:** Even though both use ASME Section IX for qualification, the essential variables (PWHT, impact testing, NDT) differ.
4. **Use the PipingBox Wall Thickness Calculator:** It uses B31.3 by default. For B31.1, consult the code directly — the W factor doesn't apply.

## Why This Matters

A pipe designed to B31.1 but installed in a B31.3 service may be under-thickness for the corrosive environment. A pipe designed to B31.3 but installed in a B31.1 service may lack the high-temperature creep resistance required for steam service. Either mismatch is a safety hazard.

## Free Tools

PipingBox offers a free [Pipe Wall Thickness Calculator](/tools) based on ASME B31.3. Try it now — no login required.

---

*PipingBox provides free engineering tools, industrial jobs, and certification training for pipefitters, welders, and engineers. [Create your free profile](/register) today.*
