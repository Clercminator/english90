"""Transactional email presentation; delivery and authentication stay in commerce.py."""
from html import escape


def _button(label, url):
    return f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td align="center" bgcolor="#6500ff" style="border-radius:10px;background-color:#6500ff;mso-padding-alt:16px 20px;">
<a href="{escape(url, quote=True)}" style="display:block;padding:16px 20px;border:1px solid #6500ff;border-radius:10px;color:#ffffff;text-decoration:none;font-size:16px;line-height:24px;font-weight:bold;text-align:center;">{escape(label)}</a>
</td></tr></table>'''


def _frame(title, preview, body, account_url, support_email):
    account = escape(account_url, quote=True)
    support = escape(support_email, quote=True)
    site = account_url.rstrip('/').rsplit('/cuenta', 1)[0]
    legal = escape(site + '/terminos/', quote=True)
    privacy = escape(site + '/privacidad/', quote=True)
    return f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>{escape(title)}</title>
<style>body,table,td,a{{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}}table{{border-collapse:collapse;}}a:focus-visible{{outline:3px solid #6500ff;outline-offset:3px;}}
@media screen and (max-width:480px){{.email-outer{{padding:16px 8px!important;}}.email-content{{padding:28px 20px!important;}}.email-heading{{font-size:28px!important;line-height:36px!important;}}}}</style></head>
<body style="margin:0;padding:0;width:100%;background-color:#f5f3fb;color:#11152d;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{escape(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f3fb"><tr><td class="email-outer" align="center" style="padding:36px 16px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:18px 18px 0 0;padding:30px 32px 24px;border-bottom:1px solid #eee9f8;">
<a href="{account}" aria-label="English90" style="font-size:30px;line-height:36px;font-weight:bold;letter-spacing:-1px;text-decoration:none;color:#11152d;">English<span style="color:#6500ff;">90</span></a>
<p style="margin:5px 0 0;font-size:12px;line-height:18px;color:#62627b;">Aprende. Practica. Avanza a tu ritmo.</p></td></tr>
<tr><td class="email-content" bgcolor="#ffffff" style="background-color:#ffffff;padding:32px;">{body}</td></tr>
<tr><td bgcolor="#11152d" style="background-color:#11152d;padding:24px 32px;border-radius:0 0 18px 18px;color:#ffffff;">
<p style="margin:0 0 8px;font-size:14px;line-height:22px;font-weight:bold;">¿Necesitas ayuda?</p>
<p style="margin:0;font-size:13px;line-height:22px;color:#e3dfef;">Escríbenos a <a href="mailto:{support}" style="color:#ffffff;text-decoration:underline;overflow-wrap:anywhere;">{support}</a>.</p>
<p style="margin:16px 0 0;font-size:12px;line-height:22px;color:#e3dfef;">Un producto de IMR Tech SpA<br>
<a href="{legal}" style="display:inline-block;padding:6px 0;color:#e3dfef;">Términos y Condiciones</a> &nbsp;·&nbsp; <a href="{privacy}" style="display:inline-block;padding:6px 0;color:#e3dfef;">Privacidad</a></p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>'''


def purchase_email(*, activation_url, download_url, account_url, support_email, order_id, sandbox=False):
    """Return both MIME alternatives; never accept or include a PDF password."""
    subject = '[SANDBOX] English90 · PDF de prueba y acceso' if sandbox else 'Tu guía English90 está lista · Empecemos'
    preview = 'Activa tu cuenta, encuentra la contraseña y descarga tu guía protegida.'
    notice = '''<p style="margin:0 0 24px;padding:14px 16px;border:1px solid #e4bb36;border-radius:8px;background-color:#fff4c9;color:#5b4100;font-size:14px;line-height:22px;"><strong>PRUEBA SANDBOX · Sin cobro real</strong><br>Este correo es una prueba. El PDF es una muestra técnica sin contenido comercial.</p>''' if sandbox else ''
    heading = 'Tu entrega de prueba está lista.' if sandbox else 'Tu camino con English90 empieza hoy.'
    intro = 'La prueba de entrega se ha preparado. Sigue estos pasos para comprobar el acceso.' if sandbox else '¡Gracias por elegir English90! Tu pago está confirmado y tu guía protegida ya está lista. Vamos paso a paso.'
    amount = 'Importe de prueba: $59.990 CLP · Sin cobro real' if sandbox else 'English90 Premium · $59.990 CLP · Pago único'
    body = f'''{notice}<p style="margin:0 0 12px;color:#6500ff;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1px;">{'ENTREGA DE PRUEBA' if sandbox else 'TU GUÍA ESTÁ LISTA'}</p>
<h1 class="email-heading" style="margin:0 0 18px;color:#11152d;font-size:32px;line-height:40px;letter-spacing:-0.8px;">{heading}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#353a54;">{intro}</p>
<p style="margin:0 0 28px;padding:14px 16px;background-color:#f6f1ff;border-radius:8px;font-size:14px;line-height:22px;color:#3d2864;">{amount}</p>
<h2 style="margin:0 0 10px;font-size:19px;line-height:28px;color:#11152d;">1. Entra a tu cuenta</h2>
<p style="margin:0 0 18px;font-size:15px;line-height:25px;color:#353a54;">Usa este enlace para activar o abrir tu cuenta. Dentro encontrarás la <strong>contraseña para abrir el PDF</strong>. No necesitas crear una contraseña de cuenta.</p>
{_button('Entrar a mi cuenta', activation_url)}
<p style="margin:10px 0 28px;font-size:12px;line-height:20px;color:#62627b;">El enlace de acceso es personal, de un solo uso y tiene vencimiento. No lo compartas.</p>
<h2 style="margin:0 0 10px;font-size:19px;line-height:28px;color:#11152d;">2. Descarga y abre tu guía</h2>
<p style="margin:0 0 14px;font-size:15px;line-height:25px;color:#353a54;">Guarda el archivo en tu dispositivo y ábrelo con la contraseña que aparece en tu cuenta. Por seguridad, la contraseña del PDF no se envía por correo.</p>
<p style="margin:0 0 8px;font-size:15px;line-height:25px;"><a href="{escape(download_url, quote=True)}" style="display:inline-block;padding:10px 0;color:#5600dc;font-weight:bold;text-decoration:underline;">Descargar mi guía protegida</a></p>
<p style="margin:0 0 28px;font-size:12px;line-height:20px;color:#62627b;">Este enlace de descarga es válido durante 24 horas. Después podrás volver a descargar la guía desde tu cuenta.</p>
<h2 style="margin:0 0 10px;font-size:19px;line-height:28px;color:#11152d;">3. Empieza con un paso pequeño</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:25px;color:#353a54;">Abre la sección de inicio de la guía y sigue tu ruta de estudio. Complementa lo aprendido con la plataforma gratuita de práctica y tests. Tu progreso de práctica se guarda en el navegador que uses, sin sincronización entre dispositivos.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:18px;background-color:#fff7d8;border-radius:8px;">
<h2 style="margin:0 0 8px;font-size:15px;line-height:23px;color:#11152d;">¿El enlace venció o no funciona?</h2>
<p style="margin:0 0 12px;font-size:14px;line-height:23px;color:#353a54;">Ve a <a href="{escape(account_url, quote=True)}" style="color:#5600dc;font-weight:bold;">Mi cuenta</a> y solicita otro enlace con el mismo correo de tu compra. No necesitas volver a pagar.</p>
<p style="margin:0 0 12px;font-size:14px;line-height:23px;color:#353a54;">Si sigues sin poder acceder, escribe a <a href="mailto:{escape(support_email, quote=True)}" style="color:#5600dc;">{escape(support_email)}</a> con el correo de compra, una breve explicación y el comprobante de Mercado Pago con el identificador de la operación. Oculta saldos, datos de tarjeta y otros movimientos. Nunca envíes contraseñas ni códigos de acceso.</p>
<p style="margin:0;font-size:14px;line-height:23px;color:#353a54;">Revisaremos el pago y, una vez verificado, gestionaremos manualmente la entrega de tu guía. Sentimos las molestias que pueda causar un fallo técnico.</p></td></tr></table>
<p style="margin:24px 0 0;font-size:12px;line-height:20px;color:#62627b;overflow-wrap:anywhere;word-break:break-all;">Referencia de compra: {escape(order_id)}</p>'''
    text = f'''English90 · {'ENTREGA DE PRUEBA' if sandbox else 'Tu guía está lista'}
{'PRUEBA SANDBOX: sin cobro real. El PDF es una muestra técnica sin contenido comercial.' if sandbox else '¡Gracias por elegir English90! Tu pago está confirmado.'}
{amount}

1. Entra a tu cuenta y encuentra la contraseña para abrir el PDF:
{activation_url}
Este enlace personal es de un solo uso y tiene vencimiento. No lo compartas.

2. Descarga tu guía protegida (enlace válido durante 24 horas):
{download_url}
La contraseña del PDF no se envía por correo; está en tu cuenta.

3. Empieza con la sección de inicio de la guía y complementa tu estudio con la plataforma gratuita de práctica y tests.
Tu progreso de práctica se guarda en este navegador, sin sincronización entre dispositivos.

Si un enlace vence o no funciona, solicita otro desde Mi cuenta con el correo de tu compra:
{account_url}
No necesitas volver a pagar.

Si sigues sin poder acceder, escribe a {support_email} con el correo de compra,
una breve explicación y el comprobante de Mercado Pago con el identificador de la operación.
Oculta saldos, datos de tarjeta y otros movimientos. Nunca envíes contraseñas ni códigos de acceso.
Revisaremos el pago y, una vez verificado, gestionaremos manualmente la entrega de tu guía.
Sentimos las molestias que pueda causar un fallo técnico.

Referencia de compra: {order_id}
Soporte: {support_email}
IMR Tech SpA'''
    return {'subject': subject, 'html': _frame(subject, preview, body, account_url, support_email), 'text': text}


def sign_in_email(*, activation_url, account_url, support_email, confirmation=False):
    subject = 'Confirma tu correo · English90' if confirmation else 'Tu enlace de acceso a English90'
    heading = 'Confirma tu correo.' if confirmation else 'Ingresa a tu cuenta.'
    intro = 'Confirma esta dirección para activar tu cuenta English90.' if confirmation else 'Recibimos una solicitud para ingresar a tu cuenta English90. Usa el botón para continuar.'
    body = f'''<p style="margin:0 0 12px;color:#6500ff;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1px;">TU CUENTA ENGLISH90</p>
<h1 class="email-heading" style="margin:0 0 18px;font-size:32px;line-height:40px;letter-spacing:-0.8px;color:#11152d;">{heading}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:26px;color:#353a54;">{intro} No necesitas recordar una contraseña de cuenta.</p>
{_button('Confirmar mi correo' if confirmation else 'Entrar a mi cuenta', activation_url)}
<p style="margin:14px 0 24px;font-size:13px;line-height:22px;color:#62627b;">Este enlace es personal, de un solo uso y tiene vencimiento. No lo compartas.</p>
<p style="margin:0 0 20px;padding:16px;background-color:#f6f1ff;border-radius:8px;font-size:14px;line-height:24px;color:#353a54;">Si compraste la guía, desde tu cuenta puedes descargarla y consultar la contraseña del PDF. Este correo de acceso no confirma una compra.</p>
<p style="margin:0;font-size:14px;line-height:24px;color:#353a54;">Si el enlace venció, solicita otro en <a href="{escape(account_url, quote=True)}" style="color:#5600dc;">Mi cuenta</a>. Si no hiciste esta solicitud, puedes ignorar este correo.</p>'''
    return {'subject': subject, 'html': _frame(subject, 'Tu enlace personal para acceder a English90.', body, account_url, support_email)}
