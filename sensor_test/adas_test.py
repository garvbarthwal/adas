import asyncio
import logging
from ld2410 import LD2410
from ld2410.models import RadarFrame

# Set up logging so we can see the driver's background activity
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

async def simulated_adas_websocket(radar: LD2410):
    """
    This function simulates a FastAPI WebSocket endpoint or background task.
    It awaits new radar frames without blocking the main thread.
    """
    queue = radar.get_frame_queue()
    print("--- ADAS WebSocket Simulation Started ---")
    
    frames_received = 0
    while frames_received < 10:  # Run for 10 frames then exit
        # Await the frame without blocking the async event loop
        # queue.get() is blocking, so we use asyncio.to_thread
        frame: RadarFrame = await asyncio.to_thread(queue.get)
        frames_received += 1
        
        # In a real app, this would be: await websocket.send_json(frame.dict())
        print(f"📡 Pushed to ADAS -> Status: {frame.target_state}, MoveDist: {frame.moving_distance}cm, StatDist: {frame.stationary_distance}cm")
        
    print("--- ADAS WebSocket Simulation Completed ---")

def custom_callback(frame: RadarFrame):
    """
    This callback fires in the background thread immediately when a frame arrives.
    """
    if frame.target_state == 3: # Moving + Stationary
        # Log a warning to standard logging, without freezing the ADAS loop
        logging.warning("⚠️ High activity detected! Moving and Stationary targets present.")

async def main():
    radar = LD2410()
    
    # Enable engineering mode to get full data (optional)
    try:
        radar.enable_engineering_mode()
        print("Engineering mode enabled.")
    except Exception as e:
        print(f"Could not enable engineering mode: {e}")

    # Register our synchronous callback
    radar.on_frame(custom_callback)
    
    # Start the background polling thread
    radar.start()
    
    try:
        # Run our simulated ADAS application
        await simulated_adas_websocket(radar)
    finally:
        # Clean up safely
        radar.stop()
        radar.close()

if __name__ == "__main__":
    asyncio.run(main())
