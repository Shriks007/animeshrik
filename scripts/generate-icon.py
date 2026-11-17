import zlib
import struct
import math

def create_png(width, height, get_pixel):
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b, a = get_pixel(x, y, width, height)
            raw_data.extend([int(r), int(g), int(b), int(a)])
    
    compressed = zlib.compress(bytes(raw_data), 9)
    
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    
    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

def icon_shader(x, y, w, h):
    # Normalized coords [-1, 1]
    nx = (x - w / 2) / (w / 2)
    ny = (y - h / 2) / (h / 2)
    dist = math.sqrt(nx * nx + ny * ny)

    # Base dark background #0d0f14
    bg_r, bg_g, bg_b = 13, 15, 20

    # Subtle radial glow from center
    glow = max(0.0, 1.0 - dist * 1.1)
    # Red-orange accent glow #ff3b1e
    r = bg_r + glow * 55
    g = bg_g + glow * 15
    b = bg_b + glow * 10

    # Safe-zone inner ring (circle dist ~ 0.65)
    ring_dist = abs(dist - 0.68)
    if ring_dist < 0.02:
        ring_alpha = 1.0 - (ring_dist / 0.02)
        r += ring_alpha * 220
        g += ring_alpha * 80
        b += ring_alpha * 20

    # Draw stylized "A" and "S" letterforms in the center
    # Center bounds: nx between -0.45 and 0.45, ny between -0.45 and 0.45
    # Diagonal katana slash through center (ny = -nx * 1.1)
    slash_dist = abs(ny + nx * 0.95 + 0.05)
    if slash_dist < 0.06 and dist < 0.58:
        slash_alpha = 1.0 - (slash_dist / 0.06)
        r = min(255, r + slash_alpha * 255)
        g = min(255, g + slash_alpha * 120)
        b = min(255, b + slash_alpha * 40)

    # Left triangle A peak
    # A bar: nx in [-0.35, 0.0], ny in [-0.38, 0.35]
    in_a = False
    # Left stroke of A
    d_a_left = abs((ny + 0.35) - 2.0 * (nx + 0.18))
    if d_a_left < 0.07 and -0.38 <= ny <= 0.35 and nx <= 0.0:
        in_a = True
    # Right stroke of A
    d_a_right = abs((ny + 0.35) + 2.0 * (nx + 0.02))
    if d_a_right < 0.07 and -0.38 <= ny <= 0.35 and -0.25 <= nx <= 0.1:
        in_a = True
    # Crossbar of A
    if abs(ny - 0.05) < 0.04 and -0.22 <= nx <= 0.02:
        in_a = True

    # S curves on right: nx in [0.05, 0.38]
    in_s = False
    # Top arc of S
    d_s_top = math.sqrt((nx - 0.22)**2 + (ny + 0.18)**2)
    if abs(d_s_top - 0.14) < 0.045 and (ny <= -0.18 or nx >= 0.22):
        in_s = True
    # Bottom arc of S
    d_s_bot = math.sqrt((nx - 0.20)**2 + (ny - 0.16)**2)
    if abs(d_s_bot - 0.15) < 0.045 and (ny >= 0.16 or nx <= 0.20):
        in_s = True
    # Middle diagonal of S
    if abs(ny + nx * 0.8 - 0.16) < 0.04 and 0.08 <= nx <= 0.32 and -0.15 <= ny <= 0.15:
        in_s = True

    if in_a:
        # Fiery gradient for A (orange -> red)
        t = (ny + 0.38) / 0.73
        r = 255
        g = int(140 * (1.0 - t * 0.5))
        b = int(30 * (1.0 - t))
    elif in_s:
        # Bright crisp anime white-silver for S
        r = 245
        g = 248
        b = 255

    # Circular mask for outer boundary
    if dist > 0.96:
        alpha = max(0.0, 1.0 - (dist - 0.96) / 0.04)
        return int(r), int(g), int(b), int(alpha * 255)

    return int(min(255, r)), int(min(255, g)), int(min(255, b)), 255

print("Rendering 512x512 icon...")
png_bytes = create_png(512, 512, icon_shader)
with open('src-tauri/icons/icon.png', 'wb') as f:
    f.write(png_bytes)
with open('static/icon-512.png', 'wb') as f:
    f.write(png_bytes)

print("Rendering 128x128 icon...")
png_bytes_128 = create_png(128, 128, icon_shader)
with open('src-tauri/icons/128x128.png', 'wb') as f:
    f.write(png_bytes_128)
with open('src-tauri/icons/128x128@2x.png', 'wb') as f:
    f.write(png_bytes)
with open('static/favicon.png', 'wb') as f:
    f.write(create_png(64, 64, icon_shader))

print("Icons generated successfully!")
