// Smooth scrolling for menu links
document.querySelectorAll('.menu a').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (!targetId || !targetId.startsWith('#')) return;

        const target = document.querySelector(targetId);
        if (!target) return;

        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
    });
});

// Fixed CTA button behavior
const headerCta = document.querySelector('.header-cta');
const hero = document.querySelector('.hero');
const previewSection = document.getElementById('preview');

if (headerCta && hero) {
    const transitionPoint = hero.offsetHeight / 3;

    const updateHeaderCtaVisibility = () => {
        headerCta.classList.toggle('scrolled', window.scrollY > transitionPoint);

        if (!previewSection) {
            headerCta.style.opacity = '1';
            headerCta.style.pointerEvents = 'auto';
            return;
        }

        const previewTop = previewSection.offsetTop - (headerCta.offsetHeight || 0);

        if (window.scrollY >= previewTop) {
            headerCta.style.opacity = '0';
            headerCta.style.pointerEvents = 'none';
        } else {
            headerCta.style.opacity = '1';
            headerCta.style.pointerEvents = 'auto';
        }
    };

    window.addEventListener('scroll', updateHeaderCtaVisibility);
    window.addEventListener('resize', updateHeaderCtaVisibility);
    updateHeaderCtaVisibility();
}

// Sample page showcase — enlarge page image in a lightbox
const pagePickerButtons = document.querySelectorAll(".page-picker-btn");
const pageShowcaseImage = document.getElementById("pageShowcaseImage");
const pageShowcaseBlurb = document.getElementById("pageShowcaseBlurb");
const pageShowcaseCta = document.getElementById("pageShowcaseCta");
const pageFrame = document.getElementById("pageFrame");
const pageLightbox = document.getElementById("pageLightbox");
const pageLightboxBackdrop = document.getElementById("pageLightboxBackdrop");
const pageLightboxClose = document.getElementById("pageLightboxClose");
const pageLightboxImage = document.getElementById("pageLightboxImage");
const pageLightboxTitle = document.getElementById("pageLightboxTitle");
const pageLightboxMeta = document.getElementById("pageLightboxMeta");
const pageLightboxPdf = document.getElementById("pageLightboxPdf");

let pageLightboxLastFocus = null;
let activeSample = {
    image: "assets/video-cardiology.png",
    pdf: "assets/Cardiology_preview.pdf",
    title: "Cardiology",
    pages: 26,
    blurb: "From presentation clues to diagnosis and contrast—then room to make it yours."
};

function setActiveSample(button) {
    if (!button) return;

    activeSample = {
        image: button.dataset.pageImage,
        pdf: button.dataset.pagePdf,
        title: button.dataset.pageTitle,
        pages: button.dataset.pagePages ? Number(button.dataset.pagePages) : null,
        blurb: button.dataset.pageBlurb || ""
    };

    pagePickerButtons.forEach((btn) => {
        const isActive = btn === button;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
    });

    if (pageShowcaseImage) {
        pageShowcaseImage.src = activeSample.image;
        pageShowcaseImage.alt = `Sample page from ${activeSample.title} in For The Boards`;
    }
    if (pageShowcaseBlurb) pageShowcaseBlurb.textContent = activeSample.blurb;
    if (pageFrame) {
        pageFrame.setAttribute("aria-label", `Enlarge ${activeSample.title} sample page`);
    }
}

function openPageLightbox() {
    if (!pageLightbox) return;

    pageLightboxLastFocus = document.activeElement;

    if (pageLightboxImage) {
        pageLightboxImage.src = activeSample.image;
        pageLightboxImage.alt = `Enlarged sample page from ${activeSample.title}`;
    }
    if (pageLightboxTitle) {
        pageLightboxTitle.textContent = activeSample.title;
    }
    if (pageLightboxMeta) {
        const pageLabel = activeSample.pages
            ? `~${activeSample.pages} pages in the full guide`
            : "Sample page from the full guide";
        pageLightboxMeta.textContent = `${pageLabel} · Updated July 2026`;
    }
    if (pageLightboxPdf) {
        pageLightboxPdf.href = activeSample.pdf;
    }

    pageLightbox.hidden = false;
    document.body.style.overflow = "hidden";
    // Double rAF so the browser paints the closed state before animating open
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            pageLightbox.classList.add("is-open");
        });
    });

    if (pageLightboxClose) pageLightboxClose.focus();
}

function closePageLightbox() {
    if (!pageLightbox) return;

    pageLightbox.classList.remove("is-open");
    document.body.style.overflow = "";

    const finish = () => {
        pageLightbox.hidden = true;
        if (pageLightboxLastFocus && typeof pageLightboxLastFocus.focus === "function") {
            pageLightboxLastFocus.focus();
        }
        pageLightboxLastFocus = null;
    };

    // Short delay so fade-out can play
    window.setTimeout(finish, 180);
}

if (pagePickerButtons.length) {
    pagePickerButtons.forEach((button) => {
        button.addEventListener("click", () => setActiveSample(button));
    });
    const initiallyActive = document.querySelector(".page-picker-btn.is-active") || pagePickerButtons[0];
    setActiveSample(initiallyActive);
}

if (pageShowcaseCta) {
    pageShowcaseCta.addEventListener("click", openPageLightbox);
}

if (pageFrame) {
    pageFrame.addEventListener("click", openPageLightbox);
}

if (pageLightboxClose) {
    pageLightboxClose.addEventListener("click", closePageLightbox);
}

if (pageLightboxBackdrop) {
    pageLightboxBackdrop.addEventListener("click", closePageLightbox);
}

const contactModal = document.getElementById("contactModal");
const contactClose = document.getElementById("contactClose");
const contactTriggers = document.querySelectorAll('[data-contact-trigger]');
const contactForm = document.querySelector('.contact-form');
const contactFormStatus = contactForm ? contactForm.querySelector('[data-form-status]') : null;
const contactSubmitButton = contactForm ? contactForm.querySelector('.contact-submit') : null;

const focusFirstTrigger = () => {
    if (contactTriggers.length > 0) {
        contactTriggers[0].focus();
    }
};

const openContactModal = () => {
    if (!contactModal) return;
    contactModal.hidden = false;
    contactModal.style.display = "flex";
    document.body.style.overflow = "hidden";
    contactTriggers.forEach(trigger => trigger.setAttribute("aria-expanded", "true"));
    const firstField = contactForm ? contactForm.querySelector('input, textarea, select') : null;
    if (firstField) {
        firstField.focus();
    }
};

const closeContactModal = () => {
    if (!contactModal) return;
    contactModal.hidden = true;
    contactModal.style.display = "none";
    document.body.style.overflow = "";
    contactTriggers.forEach(trigger => trigger.setAttribute("aria-expanded", "false"));
    focusFirstTrigger();
};

if (contactTriggers.length && contactModal) {
    contactTriggers.forEach(trigger => {
        trigger.addEventListener("click", openContactModal);
        trigger.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " " || event.key === "Space") {
                event.preventDefault();
                openContactModal();
            }
        });
        trigger.setAttribute("tabindex", "0");
        trigger.setAttribute("role", "button");
        trigger.setAttribute("aria-controls", "contactModal");
        trigger.setAttribute("aria-expanded", "false");
    });
}

if (contactClose && contactModal) {
    contactClose.addEventListener("click", closeContactModal);
}

window.addEventListener("click", event => {
    if (contactModal && event.target === contactModal) {
        closeContactModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        if (pageLightbox && !pageLightbox.hidden) {
            closePageLightbox();
        }
        if (contactModal && !contactModal.hidden) {
            closeContactModal();
        }
    }
});

if (contactForm && contactSubmitButton) {
    contactForm.addEventListener('submit', async event => {
        event.preventDefault();

        if (contactFormStatus) {
            contactFormStatus.textContent = 'Sending your request…';
        }

        contactSubmitButton.disabled = true;

        try {
            const formData = new FormData(contactForm);
            const response = await fetch(contactForm.action, {
                method: 'POST',
                body: formData,
                headers: {
                    Accept: 'application/json'
                }
            });

            if (response.ok) {
                if (contactFormStatus) {
                    contactFormStatus.textContent = 'Thanks — we’ll be in touch shortly.';
                }
                contactForm.reset();
                setTimeout(() => {
                    if (contactFormStatus) {
                        contactFormStatus.textContent = '';
                    }
                    closeContactModal();
                }, 1800);
            } else {
                const data = await response.json().catch(() => null);
                const errorMessage = data && data.error ? data.error : 'Something went wrong. Please try again.';
                if (contactFormStatus) {
                    contactFormStatus.textContent = errorMessage;
                }
            }
        } catch (error) {
            if (contactFormStatus) {
                contactFormStatus.textContent = 'Network error. Please try again in a moment.';
            }
        } finally {
            contactSubmitButton.disabled = false;
        }
    });
}

// Scroll-triggered animation for "Why Choose" features
const features = document.querySelectorAll('.why-choose .feature');
window.addEventListener('scroll', () => {
    features.forEach(feature => {
        const featurePosition = feature.getBoundingClientRect().top;
        const screenPosition = window.innerHeight / 1.3;
        if (featurePosition < screenPosition) {
            feature.classList.add('animate');
        }
    });
});
