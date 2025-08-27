import checkDiskSpace from "check-disk-space";

export async function canFitOnDisk(
  sizeInBytes: number,
  path: string = "./",
  safetyBufferBytes: number = 100 * 1024 * 1024
): Promise<boolean> {
  try {
    const diskSpace = await checkDiskSpace(path);
    const availableSpace = diskSpace.free - safetyBufferBytes;
    return sizeInBytes <= availableSpace;
  } catch (error) {
    console.error("Error checking disk space:", error);
    // Return false as a safe default when we can't determine disk space
    return false;
  }
}
