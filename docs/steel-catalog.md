# Standard profile catalogue

Source: [Tibnor construction tables 2023](https://www.tibnor.se/medias/konstruktionstabellerSWE-2023.pdf?context=bWFzdGVyfHJvb3R8MzE0ODU1NnxhcHBsaWNhdGlvbi9wZGZ8aDFhL2gwZi85MTEwNDM1ODIzNjQ2L2tvbnN0cnVrdGlvbnN0YWJlbGxlclNXRS0yMDIzLnBkZnxkZjllN2E2MzBjOGIyOTBhNDkyYTQ5ZGIwY2NiYTllMzAxNjdiN2VmZWZhZGY3MTFiZmRjMDBkMTdlYmY1NDQx), PDF pages 5–10, printed pages 8–19. Accessed 2026-10-07.

Source PDF SHA-256: `4977fea5282dbf5ed1e64fe8217be164a4cb46c26a40bdbaa1fe315570faa711`.

`src/steel-profile-data.js` stores the nominal section dimensions in millimetres. For IPE/HEA/HEB/HEM, source columns are h, b, t, d, R. For UPE and U/UNP they are h, b, d, t, R1/Rk, R2/Rf. The source U series from U 65 to U 400 appears as UNP in the catalogue; special small U bars are excluded.

Parallel flange profiles and root/tip fillets are closed polylines with exact circular bulges. UNP has tapered flange faces (8% through 300, 5% above 300); nominal flange thickness is measured at b/2 through 300, and at (b+d)/2 above 300. Slope convention: [ArcelorMittal 2024 sales programme](https://sections.arcelormittal.com/repository2/Sections/Sections_MB_ArcelorMittal_FR_EN_DE_V2024-1.pdf), UPN section diagram. Radii remain as given by Tibnor, including their stated fractional values.

All profiles are 2D cross-sections at 1:1 model scale. No structural capacity or stock availability is calculated. Geometry uses the active layer and drawing colour/linetype defaults. A profile block definition is added only when placed, in the same undoable transaction as its instance. Cancellation does not change the drawing. Existing definitions are reused by identity, and their current geometry is resolved again at insertion.

Own details are block definitions from the active drawing. Favourites are stored locally, with own-block keys scoped to the current project. The catalogue and profile data work offline after the app is cached. Supplier references are informational links, never required for insertion.
