# Torres Vigilância Patrimonial - Website

## Overview
Institutional landing page for Torres Vigilância Patrimonial, a security company authorized by the Brazilian Federal Police. Single-page website with sections for hero, about, services, escort quote calculator (WhatsApp integration), contact, and footer.

## Architecture
- **Frontend**: React + TypeScript + Vite (single-page landing site)
- **Backend**: Express (minimal, serves static assets)
- **Styling**: Tailwind CSS with custom theme (brand colors: red primary, dark charcoal)
- **Animations**: Framer Motion for scroll-triggered animations
- **Icons**: Lucide React + React Icons (WhatsApp logo)

## Key Files
- `client/src/pages/home.tsx` - Main landing page with all sections (Navbar, Hero, About, Services, Escort Calculator, Contact, Footer)
- `client/src/App.tsx` - App router
- `client/src/index.css` - Theme variables (red primary: 0 80% 40%)
- `client/index.html` - SEO meta tags in Portuguese

## Features
- Responsive navigation with mobile hamburger menu
- Hero section with statistics and CTA
- About section with company info and logo
- Services section (Vigilância Patrimonial, Escolta Armada, Facilities)
- Escort quote calculator that generates a pre-formatted WhatsApp message
- Contact section with phone, WhatsApp, and email cards
- Smooth scroll navigation between sections

## WhatsApp Integration
The escort calculator form collects origin, destination, and cargo type, then opens WhatsApp with a pre-formatted message using the `wa.me` API. The phone number constant `WHATSAPP_NUMBER` in `home.tsx` needs to be updated with the real number.

## Brand Colors
- Primary (Red): `0 80% 40%` (light) / `0 80% 50%` (dark)
- Background dark sections: `hsl(220, 12%, 10%)`
- Fonts: Montserrat (primary), Inter (fallback)
