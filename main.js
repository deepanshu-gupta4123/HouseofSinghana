document.addEventListener('DOMContentLoaded', () => {
    // ═══════════════════════════════════════════
    // 1. CUSTOM CURSOR & MAGNETIC EFFECT
    // ═══════════════════════════════════════════
    const cursorDot = document.getElementById('cursor-dot');
    const cursorOutline = document.getElementById('cursor-outline');
    const magneticElements = document.querySelectorAll('.magnetic');

    let mouseX = 0;
    let mouseY = 0;
    let outlineX = 0;
    let outlineY = 0;
    let isHovering = false;

    // Disable custom cursor immediately if touch event is detected
    let hasTouch = false;
    const disableCustomCursor = () => {
        hasTouch = true;
        if (cursorDot) cursorDot.style.display = 'none';
        if (cursorOutline) cursorOutline.style.display = 'none';
        document.body.style.cursor = 'default';
        document.querySelectorAll('a, button, .tile-option, .product-card, .btn-action, input, select, textarea').forEach(el => {
            el.style.cursor = 'pointer';
        });
    };
    window.addEventListener('touchstart', disableCustomCursor, { once: true });

    // Only enable custom cursor if device has pointer (not touch)
    if (window.matchMedia("(pointer: fine)").matches) {
        document.addEventListener('mousemove', (e) => {
            if (hasTouch) return;
            mouseX = e.clientX;
            mouseY = e.clientY;

            // Dot follows exactly
            cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
        });

        // Easing for outline
        const animateCursor = () => {
            if (hasTouch) return;
            if (!isHovering) {
                outlineX += (mouseX - outlineX) * 0.15;
                outlineY += (mouseY - outlineY) * 0.15;
                cursorOutline.style.transform = `translate(${outlineX}px, ${outlineY}px) translate(-50%, -50%)`;
            }
            requestAnimationFrame(animateCursor);
        };
        animateCursor();

        // Magnetic Effect
        magneticElements.forEach((el) => {
            el.addEventListener('mousemove', (e) => {
                if (hasTouch) return;
                isHovering = true;
                const rect = el.getBoundingClientRect();
                const strength = el.getAttribute('data-strength') || 20;
                
                // Calculate position relative to center of element
                const elCenterX = rect.left + rect.width / 2;
                const elCenterY = rect.top + rect.height / 2;
                
                // Distance from center
                const distX = e.clientX - elCenterX;
                const distY = e.clientY - elCenterY;

                // Move element slightly towards mouse
                el.style.transform = `translate(${distX / strength}px, ${distY / strength}px)`;

                // Snap cursor outline to element
                cursorOutline.style.width = `${rect.width + 20}px`;
                cursorOutline.style.height = `${rect.height + 20}px`;
                cursorOutline.style.borderRadius = '8px';
                cursorOutline.style.transform = `translate(${elCenterX}px, ${elCenterY}px) translate(-50%, -50%)`;
                cursorDot.style.opacity = '0';
            });

            el.addEventListener('mouseleave', () => {
                if (hasTouch) {
                    el.style.transform = '';
                    return;
                }
                isHovering = false;
                el.style.transform = '';
                cursorOutline.style.width = '40px';
                cursorOutline.style.height = '40px';
                cursorOutline.style.borderRadius = '50%';
                cursorDot.style.opacity = '1';
                
                // Reset outline position immediately to avoid snap back animation lag
                outlineX = mouseX;
                outlineY = mouseY;
            });
        });
    }

    // ═══════════════════════════════════════════
    // 2. NAV HIDE ON SCROLL DOWN
    // ═══════════════════════════════════════════
    const nav = document.getElementById('mainNav');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;
        if (currentScroll > 100 && currentScroll > lastScroll) {
            nav.classList.add('hidden');
        } else {
            nav.classList.remove('hidden');
        }
        lastScroll = currentScroll;
    });

    // ═══════════════════════════════════════════
    // 3. SEAMLESS PARALLAX SCROLLING (rAF-Based, Cached Offsets)
    // ═══════════════════════════════════════════
    let parallaxElements = [];

    function cacheParallaxMetrics() {
        parallaxElements = [];
        const targets = document.querySelectorAll('.parallax-container');
        
        targets.forEach(container => {
            const img = container.querySelector('.parallax-img');
            if (!img) return;
            
            // Calculate absolute offsetTop relative to the document
            let offsetTop = 0;
            let obj = container;
            while (obj) {
                offsetTop += obj.offsetTop;
                obj = obj.offsetParent;
            }
            
            parallaxElements.push({
                container,
                img,
                offsetTop,
                height: container.offsetHeight,
                maxTravel: 35 // Max pixel displacement
            });
        });
    }

    let ticked = false;
    let lastScrollY = window.scrollY;

    function updateParallax() {
        const viewportHeight = window.innerHeight;
        const middleOfViewport = lastScrollY + (viewportHeight / 2);

        parallaxElements.forEach(item => {
            const containerTop = item.offsetTop - lastScrollY;
            const containerBottom = containerTop + item.height;
            
            // Check if container is visible in viewport
            if (containerBottom > 0 && containerTop < viewportHeight) {
                const containerCenter = item.offsetTop + (item.height / 2);
                const relativeCenter = containerCenter - middleOfViewport;
                
                // Map position relative to screen center to translation (-0.5 to +0.5 progress)
                const progress = relativeCenter / (viewportHeight + item.height);
                const translateY = progress * item.maxTravel;
                
                // Apply hardware-accelerated 3D composition transform
                item.img.style.transform = `translate3d(0, ${translateY}px, 0)`;
            }
        });
        
        ticked = false;
    }

    window.addEventListener('scroll', () => {
        lastScrollY = window.scrollY;
        if (!ticked) {
            window.requestAnimationFrame(updateParallax);
            ticked = true;
        }
    }, { passive: true });

    window.addEventListener('resize', () => {
        cacheParallaxMetrics();
        updateParallax();
    });

    // Run cache after page finishes loading or changes layout
    window.addEventListener('load', () => {
        cacheParallaxMetrics();
        updateParallax();
    });
    
    // Immediate fallback init
    setTimeout(() => {
        cacheParallaxMetrics();
        updateParallax();
    }, 200);

    // ═══════════════════════════════════════════
    // 4. INTERSECTION OBSERVERS (REVEALS)
    // ═══════════════════════════════════════════
    
    // Generic elements (fade, scale, etc)
    const revealElements = document.querySelectorAll('.reveal');
    const revealObserver = new IntersectionObserver((entries) => {
        let staggerCount = 0;
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Handle staggered elements
                if (entry.target.classList.contains('stagger-up')) {
                    entry.target.style.transitionDelay = `${staggerCount * 0.15}s`;
                    staggerCount++;
                }
                
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

    revealElements.forEach(el => revealObserver.observe(el));

    // Image Mask Reveals
    const imageContainers = document.querySelectorAll('.image-reveal-container');
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                imageObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2 });

    imageContainers.forEach(container => imageObserver.observe(container));

    // Title Reveal (Triggered immediately for hero)
    const titleReveal = document.querySelector('.title-reveal');
    if (titleReveal) {
        setTimeout(() => {
            titleReveal.classList.add('visible');
        }, 100);
    }

    // ═══════════════════════════════════════════
    // 5. TABS LOGIC
    // ═══════════════════════════════════════════
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all buttons in the same nav
            const nav = btn.closest('.tabs-nav');
            nav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            
            // Add active to clicked button
            btn.classList.add('active');
            
            // Hide all panes in the corresponding content area
            const content = nav.nextElementSibling;
            content.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            // Show target pane
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // ═══════════════════════════════════════════
    // 6. E-COMMERCE CART & AUTH SYNC
    // ═══════════════════════════════════════════
    window.updateNav = function() {
        const cLink = document.getElementById('nav-cart-link');
        const aLink = document.getElementById('nav-auth-link');
        
        // Remove existing admin link if it exists
        const existingAdminLink = document.getElementById('nav-admin-link');
        if (existingAdminLink) existingAdminLink.remove();

        if(cLink) {
            const cart = JSON.parse(localStorage.getItem('cart')) || [];
            const count = cart.reduce((acc, item) => acc + item.qty, 0);
            cLink.textContent = `Cart (${count})`;
        }
        if(aLink) {
            const token = localStorage.getItem('token');
            let user = null;
            try { user = JSON.parse(localStorage.getItem('user')); } catch(e) {}

            if(token) {
                aLink.textContent = 'Logout';
                aLink.href = '#';
                aLink.onclick = (e) => {
                    e.preventDefault();
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.reload();
                };
                
                if (user && user.is_admin) {
                    const adminLink = document.createElement('a');
                    adminLink.id = 'nav-admin-link';
                    adminLink.href = 'admin.html';
                    adminLink.className = 'magnetic';
                    adminLink.textContent = 'Admin';
                    aLink.parentNode.insertBefore(adminLink, aLink);
                }
            }
        }
    };
    window.updateNav();

    // ═══════════════════════════════════════════
    // 7. DYNAMIC CATALOG LOADER (INDEX.HTML)
    // ═══════════════════════════════════════════

    async function loadCatalog() {
        const grid = document.querySelector('.product-cards-grid');
        if (!grid) return;

        // Render skeleton cards initially
        grid.innerHTML = Array(3).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton-image skeleton"></div>
                <div class="skeleton-title skeleton"></div>
                <div class="skeleton-price skeleton"></div>
                <div class="skeleton-btn skeleton"></div>
            </div>
        `).join('');

        try {
            const res = await fetch('/api/store/products');
            if (!res.ok) throw new Error('Failed to load store products catalog');
            const products = await res.json();
            if (products.length > 0) {
                grid.innerHTML = products.map(p => `
                    <a href="product.html?id=${p.slug}" class="product-card magnetic" data-strength="10">
                        <div class="product-card-img">
                            <img src="${p.images && p.images[0] ? p.images[0] : 'assets/' + p.slug + '.png'}" alt="${p.name}" loading="lazy">
                        </div>
                        <div class="product-card-info">
                            <h3>${p.name}</h3>
                            <span class="price-tag">₹${p.base_price / 100} / kg</span>
                            <span class="view-btn">Select Sizes</span>
                        </div>
                    </a>
                `).join('');
                
                // Initialize 3D card tilts
                if (typeof initCardTilts === 'function') initCardTilts();
            }
        } catch (e) {
            console.error('[StoreFront] Catalog load failure:', e);
        }
    }
    loadCatalog();

    // ═══════════════════════════════════════════
    // 8. DYNAMIC AESTHETICS & STORIES ACTIONS
    // ═══════════════════════════════════════════
    
    // A. Scroll Progress Bar
    const progressBar = document.getElementById('scrollProgress');
    window.addEventListener('scroll', () => {
        if (!progressBar) return;
        const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (totalHeight > 0) {
            const progress = (window.scrollY / totalHeight) * 100;
            progressBar.style.width = `${progress}%`;
        }
    }, { passive: true });

    // B. Hero Spotlight Cursor Follower (Zero-Reflow)
    const hero = document.querySelector('.hero');
    if (hero) {
        window.addEventListener('mousemove', (e) => {
            // Since hero sits at document top:
            const x = e.clientX;
            const y = e.clientY;
            hero.style.setProperty('--mouse-x', `${x}px`);
            hero.style.setProperty('--mouse-y', `${y}px`);
        }, { passive: true });
    }

    // C. 3D Tilt Effect for Product Cards (Local Listener Approach)
    window.initCardTilts = function() {
        const cards = document.querySelectorAll('.product-card');
        cards.forEach(card => {
            // Avoid duplicate listeners
            card.removeEventListener('mousemove', handleCardTilt);
            card.addEventListener('mousemove', handleCardTilt);
            card.addEventListener('mouseleave', handleCardUntilt);
        });
    };

    function handleCardTilt(e) {
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const x = (e.clientX - rect.left - w / 2) / w;
        const y = (e.clientY - rect.top - h / 2) / h;
        
        const rotateY = x * 10;
        const rotateX = -y * 10;
        
        card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        card.style.boxShadow = '0 15px 30px rgba(28,25,23,0.08), 0 0 15px rgba(217,119,6,0.12)';
        card.style.borderColor = 'var(--saffron)';
    }

    function handleCardUntilt(e) {
        const card = e.currentTarget;
        card.style.transform = '';
        card.style.boxShadow = '';
        card.style.borderColor = '';
    }

    // Run for static cards on first load
    initCardTilts();

    // D. Cinematic Title Reveal
    const heroTitle = document.querySelector('.hero-content h1');
    if (heroTitle) {
        const text = heroTitle.textContent.trim();
        heroTitle.innerHTML = text.split(' ').map(word => {
            return `<span style="display:inline-block; overflow:hidden;"><span class="reveal-word" style="display:inline-block; transform:translateY(100%); transition: transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);">${word}</span></span>`;
        }).join(' ');
        
        setTimeout(() => {
            heroTitle.querySelectorAll('.reveal-word').forEach((el, idx) => {
                el.style.transitionDelay = `${idx * 0.08}s`;
                el.style.transform = 'translateY(0)';
            });
        }, 150);
    }
});
