module.exports = {
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'MenuCDI',
        setupIcon: 'assets/images/icon.ico'
      }
    }
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'thiagocdi',
          name: 'MenuCDI'
        },
        prerelease: false,
        draft: true
      }
    }
  ]
}